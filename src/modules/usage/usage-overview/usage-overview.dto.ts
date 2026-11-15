import { z } from 'zod';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { DATA_STATUSES, GRANULARITIES, GROUPINGS, SOURCE_KINDS } from './usage-overview.types';

export const usageOverviewQuerySchema = z.strictObject({
  from: businessDate.optional(),
  to: businessDate.optional(),
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
  period: z.strictObject({ start: responseBusinessDate, end: responseBusinessDate, days: z.number().int().positive() }),
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
