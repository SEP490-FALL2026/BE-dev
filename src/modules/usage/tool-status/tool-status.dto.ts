import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { aiToolKeySchema } from '../allowlist/allowlist.dto';

const instant = z.iso.datetime({ offset: true });
const WINDOW_CODES = [
  'PRIMARY',
  'SECONDARY',
  'SESSION',
  'WEEKLY_ALL',
  'WEEKLY_MODEL',
  'FIVE_HOUR',
  'DAILY',
  'WEEKLY',
] as const;

const quotaWindow = z.strictObject({
  code: z.enum(WINDOW_CODES),
  usedPercent: z.number().int().min(0).max(100),
  resetsAt: instant.nullable().meta({ description: 'When the window resets; null when the tool does not know.' }),
});

const snapshot = z.strictObject({
  tool: aiToolKeySchema,
  observedAt: instant,
  auth: z.strictObject({ status: z.enum(['LOGGED_IN', 'LOGGED_OUT', 'UNKNOWN', 'NOT_SUPPORTED']) }),
  quota: z.strictObject({
    status: z.enum(['OK', 'NOT_SUPPORTED', 'FAILED']),
    windows: z
      .array(quotaWindow)
      .max(3)
      .meta({ description: 'One window for each limit the tool shows; empty unless the status is OK.' }),
  }),
});

export const toolStatusBatchBodySchema = z.strictObject({ snapshots: z.array(snapshot).min(1).max(20) });

export const toolStatusResultSchema = z.strictObject({
  results: z
    .array(
      z.strictObject({
        tool: aiToolKeySchema,
        observedAt: z.iso.datetime(),
        outcome: z.enum(['ACCEPTED', 'UNCHANGED', 'REJECTED']),
        reasonCode: z.enum(['OUTSIDE_WINDOW', 'NOT_IN_ALLOWLIST', 'FUTURE_OBSERVED_AT', 'INVALID_QUOTA']).nullable(),
      }),
    )
    .max(20),
});

export const toolStatusListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const row = z.strictObject({
  tool: aiToolKeySchema,
  observedAt: z.iso.datetime(),
  authStatus: z.enum(['LOGGED_IN', 'LOGGED_OUT', 'UNKNOWN', 'NOT_SUPPORTED']),
  quotaStatus: z.enum(['OK', 'NOT_SUPPORTED', 'FAILED']),
  windowCode: z.enum(WINDOW_CODES).nullable(),
  usedPercent: z.number().int().nullable(),
  resetsAt: z.iso.datetime().nullable(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class ToolStatusBatchBodyDto extends createZodDto(toolStatusBatchBodySchema) {}
export class ToolStatusBatchResponseDto extends createZodDto(successEnvelopeSchema(toolStatusResultSchema)) {}
export class ToolStatusListQueryDto extends createZodDto(toolStatusListQuerySchema) {}
export class ToolStatusPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(row), pagination })),
) {}
