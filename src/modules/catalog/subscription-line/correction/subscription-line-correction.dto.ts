import { z } from 'zod';
import { businessDate, responseBusinessDate } from '../../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../../infrastructure/http/dto/zod-dto';

export const seatCorrectionLineParamSchema = z.strictObject({ id: z.uuid() });

const correctionBasisSchema = z.strictObject({
  requestId: z.uuid(),
  beneficiaryEmployeeId: z.uuid(),
});

export const seatCorrectionBodySchema = z.strictObject({
  delta: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((value) => value !== 0, { message: 'delta must not be zero.' }),
  effectiveOn: businessDate,
  note: z.string().trim().min(1).max(500),
  basis: correctionBasisSchema.optional(),
  expectedUpdatedAt: z.iso.datetime(),
});

export const seatReductionBodySchema = z.strictObject({
  refundedSeatChangeId: z.uuid(),
  quantity: z.number().int().positive().max(10_000),
  effectiveOn: businessDate,
  note: z.string().trim().min(1).max(500),
  expectedUpdatedAt: z.iso.datetime(),
});

export const seatCorrectionResponseSchema = z.strictObject({
  id: z.uuid(),
  subscriptionLineId: z.uuid(),
  effectiveOn: responseBusinessDate,
  delta: z.number().int(),
  reason: z.enum(['INITIAL', 'TOP_UP', 'RENEWAL', 'REDUCE']),
  source: z.enum(['GRANT', 'ADJUSTMENT', 'VENDOR_RECORD', 'MEMBER']),
  basis: z.enum(['REQUEST_ITEM', 'NONE']),
  requestId: z.uuid().nullable(),
  beneficiaryEmployeeId: z.uuid().nullable(),
  refundedSeatChangeId: z.uuid().nullable(),
  note: z.string().nullable(),
  outOfProcess: z.boolean(),
  recordedByEmployeeId: z.uuid().nullable(),
  recordedAt: z.iso.datetime(),
});

export class SeatCorrectionLineParamDto extends createZodDto(seatCorrectionLineParamSchema) {}
export class SeatCorrectionBodyDto extends createZodDto(seatCorrectionBodySchema) {}
export class SeatReductionBodyDto extends createZodDto(seatReductionBodySchema) {}
export class SeatCorrectionResponseDto extends createZodDto(successEnvelopeSchema(seatCorrectionResponseSchema)) {}
