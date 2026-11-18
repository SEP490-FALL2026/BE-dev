import { z } from 'zod';
import { successEnvelopeSchema } from '../../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../../infrastructure/http/dto/zod-dto';

const days = z.number().int().min(1).max(365);

export const thresholdListQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const thresholdParamSchema = z.strictObject({ applicationId: z.uuid() });

/** The days without use that make a seat watched, reviewed and acted on (`FR-4.13`); the order is checked by the use case (422 `THRESHOLD_ORDER`). */
export const thresholdBodySchema = z.strictObject({ monitorDays: days, reviewDays: days, actionDays: days });

const thresholdSchema = z.strictObject({
  applicationId: z.uuid(),
  applicationName: z.string(),
  monitorDays: days,
  reviewDays: days,
  actionDays: days,
  updatedAt: z.iso.datetime(),
});

export class ThresholdListQueryDto extends createZodDto(thresholdListQuerySchema) {}
export class ThresholdParamDto extends createZodDto(thresholdParamSchema) {}
export class ThresholdBodyDto extends createZodDto(thresholdBodySchema) {}
export class ThresholdListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(thresholdSchema), pagination })),
) {}
export class ThresholdResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ threshold: thresholdSchema })),
) {}
export class ThresholdDeletedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ applicationId: z.uuid() })),
) {}
