import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { QUEUE_MAX_REQUESTS } from '../ai-service/ai-service.types';
import type { QueueSummaryStatus } from './queue-summary.types';

/**
 * Every state of a call; the order is the one a call goes through. STALE is part of the wire, but only a purged call is STALE and a
 * purged call reads as 404, so no answer carries it today.
 */
const SUMMARY_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'NO_VALID_OUTPUT',
  'STALE',
  'FAILED',
] as const satisfies readonly QueueSummaryStatus[];

export const createQueueSummaryBodySchema = z.strictObject({
  queueRevision: z.string().min(1).max(128).meta({
    description:
      'The revision of the queue the person sees, as `GET /ai/access-request-summaries/source` gave it. A queue that changed since is refused (AI.SOURCE_STALE).',
  }),
});
export const queueSummaryParamSchema = z.strictObject({ invocationId: z.uuid() });

const acceptedSchema = z.strictObject({
  invocationId: z
    .uuid()
    .meta({ description: 'The call to read with `GET /ai/access-request-summaries/{invocationId}`.' }),
  status: z.enum(SUMMARY_STATUSES).meta({
    description:
      'PENDING for a call just started. The same revision asked again gives the call already kept for it, in the state it is in. FAILED when the steps of the person could not be read: the call is recorded as failed (errorCode AI.SOURCE_UNREADABLE when read) and nothing was sent to the model.',
  }),
});

const summaryLineSchema = z.strictObject({
  requestId: z.uuid(),
  stepId: z.uuid(),
  stepKind: z.enum(['NEED_APPROVAL', 'SPEND_APPROVAL']),
  summary: z.string().meta({
    description:
      'One checked line about the step, in Vietnamese. Any amount in it was written from the request, not by the model.',
  }),
});

const summarySchema = z.strictObject({
  invocationId: z.uuid(),
  status: z.enum(SUMMARY_STATUSES),
  createdAt: z.iso.datetime(),
  sourceStale: z
    .boolean()
    .meta({ description: 'True when the queue of the person changed since the summary was composed.' }),
  omittedCount: z.number().int().nonnegative().meta({
    description:
      'How many steps still given to the person the summary leaves out: past the first 20, or whose line did not pass the checks.',
  }),
  lines: z.array(summaryLineSchema).max(QUEUE_MAX_REQUESTS).meta({
    description: 'The checked lines whose step still waits for the person, in the order of the queue; at most 20.',
  }),
  errorCode: z.string().nullable().meta({
    description:
      'Why a call shows nothing, when it does not: AI.PROVIDER_UNAVAILABLE, AI.PROVIDER_TIMEOUT, AI.OUTPUT_INVALID, AI.NO_VALID_OUTPUT, AI.SOURCE_UNREADABLE or AI.INTERNAL_ERROR. A state of the call read here, never an HTTP error.',
  }),
});

const sourceSchema = z.strictObject({
  queueRevision: z.string().min(1).max(128),
  stepCount: z
    .number()
    .int()
    .nonnegative()
    .max(20)
    .meta({ description: 'How many steps a summary would cover: at most 20; 0 when no step waits for the person.' }),
  omittedCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: 'How many steps still given to the person a summary would leave out (past the first 20).' }),
});

export class CreateQueueSummaryBodyDto extends createZodDto(createQueueSummaryBodySchema) {}
export class QueueSummaryParamDto extends createZodDto(queueSummaryParamSchema) {}
export class QueueSummaryAcceptedResponseDto extends createZodDto(successEnvelopeSchema(acceptedSchema)) {}
export class QueueSummaryResponseDto extends createZodDto(successEnvelopeSchema(summarySchema)) {}
export class QueueSummarySourceResponseDto extends createZodDto(successEnvelopeSchema(sourceSchema)) {}
