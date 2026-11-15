import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { DATA_STATUSES, GRANULARITIES, GROUPINGS, SOURCE_KINDS } from './usage-overview.types';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isBusinessDate, { message: 'Not a calendar date.' });

export const usageOverviewQuerySchema = z.strictObject({
  from: date.optional(),
  to: date.optional(),
  granularity: z.enum(GRANULARITIES).default('DAY'),
  groupBy: z.enum(GROUPINGS).default('APPLICATION'),
  departmentId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  applicationId: z.uuid().optional(),
  sourceKind: z.enum(SOURCE_KINDS).optional(),
  sourceId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const applicationRefSchema = z.strictObject({ id: z.uuid(), name: z.string(), logoUrl: z.string().nullable() });
const days = z.number().int().nonnegative();

/** A point of the series: one group in one period. Only the group the series is cut by is set; the others are null. */
const usageOverviewPointSchema = z.strictObject({
  period: z.strictObject({ start: date, end: date, days: z.number().int().positive() }),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  application: applicationRefSchema.nullable(),
  source: z
    .strictObject({
      kind: z.enum(SOURCE_KINDS),
      id: z.uuid().nullable(),
      name: z.string(),
      application: applicationRefSchema,
    })
    .nullable(),
  activeDays: days,
  coveredDays: days,
  status: z.enum(DATA_STATUSES),
  updatedAt: z.iso.datetime().nullable(),
});

export class UsageOverviewQueryDto extends createZodDto(usageOverviewQuerySchema) {}
export class UsageOverviewPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(usageOverviewPointSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
