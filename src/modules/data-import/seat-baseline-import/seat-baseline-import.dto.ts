import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/**
 * Only the shape is checked here. Whether the target is exactly one subscription or one internal plan, exists and takes a
 * baseline is judged by licensing and answers with its own `SEAT_BASELINE.*` code. The ids come as text fields beside the file.
 */
export const uploadSeatImportBodySchema = z.strictObject({
  subscriptionId: z.uuid().optional(),
  planId: z.uuid().optional(),
});
export const confirmSeatImportBodySchema = z.strictObject({
  previewVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});
export const seatImportIdParamSchema = z.strictObject({ id: z.uuid() });
export const listSeatImportRowsQuerySchema = z.strictObject({
  outcome: z.enum(['VALID', 'ERROR']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

const target = z.strictObject({
  kind: z.enum(['SUBSCRIPTION', 'PLAN']),
  subscriptionId: z.uuid().nullable(),
  planId: z.uuid(),
  planName: z.string(),
  applicationName: z.string(),
  provisioningType: z.string(),
});
const summary = z.strictObject({
  target,
  totalRows: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  byCode: z.record(z.string(), z.number().int().nonnegative()),
  seats: z
    .strictObject({
      purchased: z.number().int().nonnegative(),
      occupiedBefore: z.number().int().nonnegative(),
      freeBefore: z.number().int().nonnegative(),
      freeAfter: z.number().int().nonnegative(),
    })
    .nullable(),
  recordedOn: z.string(),
});
const result = z.strictObject({
  created: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  occupied: z.number().int().nonnegative().nullable(),
  free: z.number().int().nonnegative().nullable(),
});
const importSchema = z.strictObject({
  id: z.uuid(),
  fileName: z.string(),
  status: z.enum(['PREVIEW', 'COMPLETED', 'CANCELLED']),
  previewVersion: z.number().int().positive(),
  target,
  ignoredColumns: z.array(z.string()),
  summary,
  result: result.nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
const rowSchema = z.strictObject({
  lineNumber: z.number().int().positive(),
  cells: z.record(z.string(), z.string()),
  outcome: z.enum(['VALID', 'ERROR']),
  errors: z.array(z.strictObject({ code: z.string() })),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class UploadSeatImportBodyDto extends createZodDto(uploadSeatImportBodySchema) {}
export class ConfirmSeatImportBodyDto extends createZodDto(confirmSeatImportBodySchema) {}
export class SeatImportIdParamDto extends createZodDto(seatImportIdParamSchema) {}
export class ListSeatImportRowsQueryDto extends createZodDto(listSeatImportRowsQuerySchema) {}
export class SeatImportResponseDto extends createZodDto(successEnvelopeSchema(importSchema)) {}
export class SeatImportConfirmationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ import: importSchema, replayed: z.boolean() })),
) {}
export class SeatImportRowsResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(rowSchema), pagination })),
) {}
