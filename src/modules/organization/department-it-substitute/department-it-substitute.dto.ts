import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const appointDepartmentItSubstituteBodySchema = z.strictObject({
  substituteEmployeeId: z.uuid(),
  reason: z.string().normalize('NFC').trim().min(1).max(500),
});

export const departmentItSubstituteIdParamSchema = z.strictObject({ id: z.uuid() });

export const listDepartmentItSubstitutesQuerySchema = z.strictObject({
  departmentId: z.uuid().optional(),
  state: z.enum(['ACTIVE', 'ENDED', 'ALL']).default('ACTIVE'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const itAdminLoadSchema = z.strictObject({
  employeeId: z.uuid(),
  inChargeCount: z.number().int().nonnegative(),
  substituteCount: z.number().int().nonnegative(),
  overLimit: z.boolean(),
});

const personBriefSchema = z.strictObject({
  id: z.uuid(),
  fullName: z.string(),
});

const departmentItSubstituteItemSchema = z.strictObject({
  id: z.uuid(),
  department: z.strictObject({ id: z.uuid(), name: z.string() }),
  substitute: personBriefSchema.extend({ usable: z.boolean() }),
  replaced: personBriefSchema.nullable(),
  reason: z.string(),
  appointedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  endCause: z.enum(['REMOVED', 'IN_CHARGE_NAMED', 'DEPARTMENT_RETIRED']).nullable(),
});

const appointDepartmentItSubstituteResponseSchema = z.strictObject({
  substitute: departmentItSubstituteItemSchema,
  itAdminLoad: itAdminLoadSchema,
});

const departmentItSubstitutePageSchema = z.strictObject({
  items: z.array(departmentItSubstituteItemSchema),
  pagination,
});

export class AppointDepartmentItSubstituteBodyDto extends createZodDto(appointDepartmentItSubstituteBodySchema) {}
export class DepartmentItSubstituteIdParamDto extends createZodDto(departmentItSubstituteIdParamSchema) {}
export class ListDepartmentItSubstitutesQueryDto extends createZodDto(listDepartmentItSubstitutesQuerySchema) {}
export class AppointDepartmentItSubstituteResponseDto extends createZodDto(
  successEnvelopeSchema(appointDepartmentItSubstituteResponseSchema),
) {}
export class DepartmentItSubstituteResponseDto extends createZodDto(
  successEnvelopeSchema(departmentItSubstituteItemSchema),
) {}
export class DepartmentItSubstitutePageResponseDto extends createZodDto(
  successEnvelopeSchema(departmentItSubstitutePageSchema),
) {}
