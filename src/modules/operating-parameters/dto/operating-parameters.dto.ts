import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const businessDate = z.string().refine(isBusinessDate, { message: 'Must be a real date as YYYY-MM-DD.' });
const parameterValue = z.union([z.number(), z.string(), z.array(z.number())]);

export const parameterKeyParamSchema = z.strictObject({ key: z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/) });
/** The value is only typed here; whether it is in the parameter's domain is judged by the parameter's own rule. */
export const setParameterBodySchema = z.strictObject({ value: z.unknown() });

const parameterSchema = z.strictObject({
  key: z.string(),
  value: parameterValue,
  default: parameterValue,
  isDefault: z.boolean(),
  unit: z.string(),
  description: z.string(),
  constraints: z.record(z.string(), z.unknown()),
  changedAt: z.iso.datetime().nullable(),
});

const parameterListSchema = z.strictObject({ items: z.array(parameterSchema) });
const parameterHistorySchema = z.strictObject({
  items: z.array(z.strictObject({ value: parameterValue, from: z.iso.datetime(), until: z.iso.datetime().nullable() })),
  hasMore: z.boolean(),
});

export const listNonWorkingDatesQuerySchema = z.strictObject({
  from: businessDate.optional(),
  to: businessDate.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const nonWorkingDateParamSchema = z.strictObject({ date: businessDate });
export const addNonWorkingDateBodySchema = z.strictObject({ date: businessDate, reason: z.string().max(1000) });
export const renameNonWorkingDateBodySchema = z.strictObject({ reason: z.string().max(1000) });

const nonWorkingDateSchema = z.strictObject({ date: z.string(), reason: z.string() });
const nonWorkingDateListSchema = z.strictObject({
  items: z.array(nonWorkingDateSchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export class ParameterKeyParamDto extends createZodDto(parameterKeyParamSchema) {}
export class SetParameterBodyDto extends createZodDto(setParameterBodySchema) {}
export class ParameterResponseDto extends createZodDto(successEnvelopeSchema(parameterSchema)) {}
export class ParameterListResponseDto extends createZodDto(successEnvelopeSchema(parameterListSchema)) {}
export class ParameterHistoryResponseDto extends createZodDto(successEnvelopeSchema(parameterHistorySchema)) {}

export class ListNonWorkingDatesQueryDto extends createZodDto(listNonWorkingDatesQuerySchema) {}
export class NonWorkingDateParamDto extends createZodDto(nonWorkingDateParamSchema) {}
export class AddNonWorkingDateBodyDto extends createZodDto(addNonWorkingDateBodySchema) {}
export class RenameNonWorkingDateBodyDto extends createZodDto(renameNonWorkingDateBodySchema) {}
export class NonWorkingDateResponseDto extends createZodDto(successEnvelopeSchema(nonWorkingDateSchema)) {}
export class NonWorkingDateListResponseDto extends createZodDto(successEnvelopeSchema(nonWorkingDateListSchema)) {}
