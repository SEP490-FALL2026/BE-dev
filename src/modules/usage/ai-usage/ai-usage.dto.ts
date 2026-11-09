import { z } from 'zod';
import { businessDateSchema, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { aiToolKeySchema } from '../allowlist/allowlist.dto';

const instant = z.iso.datetime({ offset: true });

const aiUsageTool = z.strictObject({
  tool: aiToolKeySchema,
  coverage: z.enum(['COVERED', 'PARTIAL', 'NOT_OBSERVABLE']),
  responses: z.number().int().min(0).max(1_000_000),
  totalTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

const aiUsageDay = z.strictObject({
  date: businessDateSchema('date must be a date'),
  tools: z
    .array(aiUsageTool)
    .min(1)
    .max(10)
    .refine((items) => new Set(items.map((item) => item.tool)).size === items.length, 'tool must not repeat')
    .meta({
      description:
        'One entry for each tool seen that day; a tool left out is not counted and an earlier count of it stays.',
      uniqueItems: true,
    }),
});

export const aiUsageBatchBodySchema = z.strictObject({
  generatedAt: instant.meta({
    description: 'When the tool built the batch; of two builds of a day, the later one wins.',
  }),
  days: z
    .array(aiUsageDay)
    .min(1)
    .max(14)
    .refine((items) => new Set(items.map((item) => item.date)).size === items.length, 'date must not repeat'),
});

const outcome = z.enum(['ACCEPTED', 'UNCHANGED', 'REJECTED']);

export const aiUsageBatchResultSchema = z.strictObject({
  results: z
    .array(
      z.strictObject({
        date: responseBusinessDate,
        outcome,
        reasonCode: z
          .enum(['OUTSIDE_WINDOW', 'NOT_IN_ALLOWLIST', 'FUTURE_GENERATED_AT', 'INVALID_COVERAGE'])
          .nullable(),
      }),
    )
    .max(14),
});

export const usageListQuerySchema = z
  .strictObject({
    from: businessDateSchema('from must be a date').optional(),
    to: businessDateSchema('to must be a date').optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from must not be after to',
    path: ['from'],
  });

export const deviceIdParamSchema = z.strictObject({ id: z.uuid() });

const usageDay = z.strictObject({
  date: responseBusinessDate,
  tool: aiToolKeySchema,
  experimental: z.boolean(),
  coverage: z.enum(['COVERED', 'PARTIAL', 'NOT_OBSERVABLE']),
  responses: z.number().int(),
  totalTokens: z.number().int(),
  active: z.boolean(),
  generatedAt: z.iso.datetime(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class AiUsageBatchBodyDto extends createZodDto(aiUsageBatchBodySchema) {}
export class AiUsageBatchResponseDto extends createZodDto(successEnvelopeSchema(aiUsageBatchResultSchema)) {}
export class UsageListQueryDto extends createZodDto(usageListQuerySchema) {}
export class DeviceIdParamDto extends createZodDto(deviceIdParamSchema) {}
export class DeviceUsagePageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(usageDay.extend({ registrationId: z.uuid() })),
      pagination,
    }),
  ),
) {}
export class MyDeviceUsagePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(usageDay), pagination })),
) {}
