import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { IDENTIFIER_TYPES } from '../vendor-source/vendor-source.types';
import { MAX_CANDIDATES } from './identity.types';

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const idParamSchema = z.strictObject({ id: z.uuid() });
export const unmatchedListQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  status: z.enum(['OPEN', 'DISMISSED', 'RESOLVED']).optional(),
  ...page,
});
export const resolveBodySchema = z.strictObject({ employeeId: z.uuid() });
export const dismissBodySchema = z.strictObject({ note: z.string().trim().min(1).max(500) });
export const mappingListQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  inForceOnly: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  ...page,
});
export const mappingEndBodySchema = z.strictObject({ reason: z.string().trim().min(3).max(500) });
export const findingListQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  ...page,
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
const method = z.enum(['EXACT_EMAIL', 'ACCOUNT_IDENTIFIER', 'ALIAS_RULE', 'MANUAL']);

const unmatchedSchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  sourceId: z.uuid(),
  identifierType: z.enum(IDENTIFIER_TYPES),
  identifier: z.string(),
  reason: z.enum(['NOT_FOUND', 'AMBIGUOUS']),
  status: z.enum(['OPEN', 'DISMISSED', 'RESOLVED']),
  candidates: z
    .array(z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), workEmail: z.string().nullable() }))
    .max(MAX_CANDIDATES),
  firstImportId: z.uuid(),
  lastImportId: z.uuid(),
  resolvedMappingId: z.uuid().nullable(),
  note: z.string().nullable(),
  handledAt: z.iso.datetime().nullable(),
});
const mappingSchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  identifierType: z.enum(IDENTIFIER_TYPES),
  identifier: z.string(),
  employeeId: z.uuid(),
  employeeCode: z.string().nullable(),
  method,
  confidence: z.enum(['HIGH', 'MEDIUM']),
  createdAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  endReason: z.string().nullable(),
});
const findingSchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  employeeId: z.uuid(),
  employeeCode: z.string().nullable(),
  firstActivityDate: z.string(),
  lastActivityDate: z.string(),
  status: z.enum(['OPEN', 'CLOSED']),
  closedAt: z.iso.datetime().nullable(),
  closedReason: z.string().nullable(),
});

export class IdParamDto extends createZodDto(idParamSchema) {}
export class UnmatchedListQueryDto extends createZodDto(unmatchedListQuerySchema) {}
export class ResolveBodyDto extends createZodDto(resolveBodySchema) {}
export class DismissBodyDto extends createZodDto(dismissBodySchema) {}
export class MappingListQueryDto extends createZodDto(mappingListQuerySchema) {}
export class MappingEndBodyDto extends createZodDto(mappingEndBodySchema) {}
export class FindingListQueryDto extends createZodDto(findingListQuerySchema) {}
export class UnmatchedResponseDto extends createZodDto(successEnvelopeSchema(unmatchedSchema)) {}
export class UnmatchedPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(unmatchedSchema), pagination })),
) {}
export class MappingResponseDto extends createZodDto(successEnvelopeSchema(mappingSchema)) {}
export class MappingPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(mappingSchema), pagination })),
) {}
export class FindingPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(findingSchema), pagination })),
) {}
