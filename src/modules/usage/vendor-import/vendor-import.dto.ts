import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { importResultSchema } from './vendor-import-result.json';
import { importSummarySchema } from './vendor-import-summary.json';
import { MAX_DAYS_PER_ROW, MAX_ROW_ERRORS } from './vendor-import.types';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The window is optional here and judged by the report: the import answers `WINDOW_REQUIRED` or `WINDOW_INVALID` with a code. */
export const uploadUsageImportBodySchema = z.strictObject({
  sourceId: z.uuid(),
  coverageFrom: date.optional(),
  coverageTo: date.optional(),
});
export const confirmUsageImportBodySchema = z.strictObject({
  previewVersion: z.number().int().positive(),
  notice: z.enum(['CONFIRMED_DELIVERED', 'SYSTEM_SENT']).optional(),
});
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
export const usageImportIdParamSchema = z.strictObject({ id: z.uuid() });
export const listUsageImportRowsQuerySchema = z.strictObject({
  outcome: z.enum(['MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'NOT_A_PERSON', 'INVALID']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

const importSchema = z.strictObject({
  id: z.uuid(),
  sourceId: z.uuid(),
  format: z.enum(['JSON', 'CSV']),
  status: z.enum(['PREVIEW', 'COMPLETED', 'CANCELLED']),
  previewVersion: z.number().int().positive(),
  summary: importSummarySchema,
  result: importResultSchema.nullable(),
  noticeMode: z.enum(['CONFIRMED_DELIVERED', 'SYSTEM_SENT']).nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
const rowSchema = z.strictObject({
  lineNumber: z.number().int().positive(),
  identifier: z.string(),
  days: z
    .array(
      z.strictObject({
        date: z.string(),
        eventClass: z.enum(['VALUE', 'PASSIVE', 'AUTH_ONLY']).nullable(),
        eventType: z.string().optional(),
        basis: z.enum(['ACTIVE_DATE', 'LAST_ACTIVITY']),
      }),
    )
    .max(MAX_DAYS_PER_ROW),
  outcome: z.enum(['MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'NOT_A_PERSON', 'INVALID']),
  matchMethod: z.enum(['EXACT_EMAIL', 'ACCOUNT_IDENTIFIER', 'ALIAS_RULE', 'MANUAL']).nullable(),
  errors: z.array(z.strictObject({ code: z.string(), detail: z.string().optional() })).max(MAX_ROW_ERRORS),
});

export class UploadUsageImportBodyDto extends createZodDto(uploadUsageImportBodySchema) {}
export class ConfirmUsageImportBodyDto extends createZodDto(confirmUsageImportBodySchema) {}
export class UsageImportIdParamDto extends createZodDto(usageImportIdParamSchema) {}
export class ListUsageImportRowsQueryDto extends createZodDto(listUsageImportRowsQuerySchema) {}
export class UsageImportResponseDto extends createZodDto(successEnvelopeSchema(importSchema)) {}
export class UsageImportConfirmationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ import: importSchema, replayed: z.boolean() })),
) {}
export class UsageImportRowsResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(rowSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
