import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

export const timingParamSchema = z.strictObject({ id: z.uuid() });

const segmentSchema = z.strictObject({
  startedAt: z.iso.datetime(),
  /** Null while the segment is still open. */
  endedAt: z.iso.datetime().nullable(),
  seconds: z.number().int().nonnegative().nullable(),
});

/** The kinds of segment, one property each: a segment the request never had is null. */
const segmentsSchema = z.strictObject({
  NEED: segmentSchema.nullable(),
  IT_ASSESSMENT: segmentSchema.nullable(),
  QUEUE_WAIT: segmentSchema.nullable(),
  SPEND_DECISION: segmentSchema.nullable(),
  GRANT: segmentSchema.nullable(),
});

/**
 * The time a request took: when it was sent, when the last approval was given, when the grant was completed, and the seconds
 * between them, with where it waited for each step (the latest segment of each of six kinds, a property each, not a list). There is no amount and no figure of a
 * budget in it, and none of the time Finance spends after the approval.
 */
export const requestTimingsSchema = z.strictObject({
  requestId: z.uuid(),
  submittedAt: z.iso.datetime(),
  approvedAt: z.iso.datetime().nullable(),
  grantCompletedAt: z.iso.datetime().nullable(),
  approvalSeconds: z.number().int().nonnegative().nullable(),
  grantSeconds: z.number().int().nonnegative().nullable(),
  totalSeconds: z.number().int().nonnegative().nullable(),
  /** Whether the request counts in the indicator of the time to grant: only when the task of the grant was completed. */
  countedInKpi: z.boolean(),
  segments: segmentsSchema,
});

export class TimingParamDto extends createZodDto(timingParamSchema) {}
export class RequestTimingsResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ timings: requestTimingsSchema })),
) {}

export type RequestTimingsWire = z.infer<typeof requestTimingsSchema>;
