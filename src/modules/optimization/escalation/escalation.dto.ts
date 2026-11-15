import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { ESCALATION_SKIP_REASONS } from './escalation.types';

/** The most recommendations one batch names. */
export const MAX_ESCALATION_ITEMS = 100;

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

export const escalationBodySchema = z.strictObject({
  recommendationIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_ESCALATION_ITEMS)
    .meta({ description: 'The recommendations to push, at most 100; one named twice counts once.' }),
  note: z.string().trim().min(1).max(500).optional().meta({
    description: 'A word of the IT Admin for the batch, kept with it; the head does not read it.',
  }),
});

const itemSchema = z.strictObject({
  recommendationId: z.uuid(),
  outcome: z.enum(['ESCALATED', 'SKIPPED']),
  reason: z.enum(ESCALATION_SKIP_REASONS).nullable().meta({ description: 'Why it was not pushed; null when it was.' }),
  state: z
    .enum(['AWAITING_DECISION', 'WAITING_FOR_HEAD'])
    .nullable()
    .meta({ description: 'Where it went: the queue of the head, or waiting for one; null when it was not pushed.' }),
  departmentId: z
    .uuid()
    .nullable()
    .meta({ description: 'The department whose head is asked; null when it was not pushed.' }),
});

export const escalationSchema = z.strictObject({
  id: z.uuid(),
  escalated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  replayed: z.boolean().meta({ description: 'The same Idempotency-Key was answered before: nothing was done again.' }),
  results: z.array(itemSchema).max(MAX_ESCALATION_ITEMS),
});

export class EscalationBodyDto extends createZodDto(escalationBodySchema) {}
export class EscalationResponseDto extends createZodDto(successEnvelopeSchema(escalationSchema)) {}
