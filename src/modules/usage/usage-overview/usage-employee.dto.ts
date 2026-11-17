import { z } from 'zod';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { MAX_DETAIL_SOURCES } from './usage-employee.types';
import { DATA_STATUSES, MAX_RANGE_DAYS } from './usage-overview.types';

const days = z.number().int().nonnegative();
const status = z.enum(DATA_STATUSES);
const updatedAt = z.iso.datetime().nullable();

const rangeQuery = { from: businessDate.optional(), to: businessDate.optional() };

export const usageSoftwareListQuerySchema = z.strictObject({
  ...rangeQuery,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export const usageSoftwareDetailQuerySchema = z.strictObject(rangeQuery);
export const usageEmployeeParamSchema = z.strictObject({ id: z.uuid() });
export const usageSoftwareParamSchema = z.strictObject({ id: z.uuid(), applicationId: z.uuid() });

/** The person by the code the company gave them: never a name, never a photo. */
const employeeSchema = z.strictObject({ id: z.uuid(), employeeCode: z.string() });
const applicationSchema = z.strictObject({ id: z.uuid(), name: z.string(), logoUrl: z.string().nullable() });
const rangeSchema = z.strictObject({ from: responseBusinessDate, to: responseBusinessDate, days: days });

/** A software in the list of one person: whether they hold a seat and the days; no count of answers or tokens (those are in the detail). */
const softwareLineSchema = z.strictObject({
  application: applicationSchema,
  hasSeat: z.boolean(),
  status,
  activeDays: days,
  coveredDays: days,
  updatedAt,
});

const vendorSourceSchema = z.strictObject({
  sourceId: z.uuid(),
  name: z.string(),
  status,
  activeDays: days,
  coveredDays: days,
  activeDates: z.array(responseBusinessDate).max(MAX_RANGE_DAYS),
  updatedAt,
});

/** What the collector saw of the tool of the person: the one place that carries a count of answers and of tokens. */
const collectorSchema = z.strictObject({
  tool: z.string(),
  status,
  activeDays: days,
  coveredDays: days,
  updatedAt,
  days: z
    .array(
      z.strictObject({
        date: responseBusinessDate,
        coverage: z.enum(['COVERED', 'PARTIAL']),
        active: z.boolean(),
        responses: days,
        totalTokens: days,
      }),
    )
    .max(MAX_RANGE_DAYS),
});

const detailSchema = z.strictObject({
  employee: employeeSchema,
  application: applicationSchema,
  range: rangeSchema,
  hasSeat: z.boolean(),
  status,
  activeDays: days,
  coveredDays: days,
  updatedAt,
  vendorSources: z.array(vendorSourceSchema).max(MAX_DETAIL_SOURCES),
  sourcesTruncated: z.boolean(),
  collector: collectorSchema.nullable(),
});

export class UsageSoftwareListQueryDto extends createZodDto(usageSoftwareListQuerySchema) {}
export class UsageSoftwareDetailQueryDto extends createZodDto(usageSoftwareDetailQuerySchema) {}
export class UsageEmployeeParamDto extends createZodDto(usageEmployeeParamSchema) {}
export class UsageSoftwareParamDto extends createZodDto(usageSoftwareParamSchema) {}
export class UsageSoftwareListResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      employee: employeeSchema,
      range: rangeSchema,
      items: z.array(softwareLineSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
export class UsageSoftwareDetailResponseDto extends createZodDto(successEnvelopeSchema(detailSchema)) {}
