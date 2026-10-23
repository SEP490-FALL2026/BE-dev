import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { COST_CENTER_CODE_MAX_LENGTH, COST_CENTER_CODE_PATTERN } from '../cost-center/cost-center.types';
import { projectSchema } from '../dto/project-wire.dto';

const businessDate = z.string().refine(isBusinessDate, { message: 'Must be a real date as YYYY-MM-DD.' });

/** Only bounded here: whether a name is empty or too long is judged by the service and answers with its own code. */
export const createDepartmentBodySchema = z.strictObject({
  code: z.string().trim().min(1).max(COST_CENTER_CODE_MAX_LENGTH).regex(COST_CENTER_CODE_PATTERN),
  name: z.string().max(1000),
  function: z.string().max(5000).nullish(),
  costCenterId: z.uuid(),
  itAdminEmployeeId: z.uuid().nullish(),
});

/** A department has no parent and its Cost Center cannot change: neither is a field (US-03-06 AC-3, AC-4). */
export const updateDepartmentBodySchema = z.strictObject({
  name: z.string().max(1000).optional(),
  function: z.string().max(5000).nullable().optional(),
  itAdminEmployeeId: z.uuid().nullable().optional(),
});

export const listDepartmentsQuerySchema = z.strictObject({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const listMembersQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const departmentIdParamSchema = z.strictObject({ id: z.uuid() });

export const assignHeadBodySchema = z.strictObject({ employeeId: z.uuid(), effectiveFrom: businessDate });
export const vacateHeadBodySchema = z.strictObject({ effectiveFrom: businessDate });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const departmentSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  function: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  costCenter: z.strictObject({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  }),
  itAdmin: z
    .strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string(), usable: z.boolean() })
    .nullable(),
  head: z
    .strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string(), since: z.string() })
    .nullable(),
  memberCount: z.number().int().nonnegative(),
  warnings: z.array(z.enum(['MISSING_HEAD', 'MISSING_IT_ADMIN'])),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deactivatedAt: z.iso.datetime().nullable(),
});

const departmentProfileSchema = departmentSchema.extend({
  headHistory: z.array(
    z.strictObject({
      employeeId: z.uuid(),
      employeeCode: z.string(),
      fullName: z.string(),
      validFrom: z.string(),
      validTo: z.string().nullable(),
    }),
  ),
  headHistoryHasMore: z.boolean(),
  projects: z.array(projectSchema),
  projectTotal: z.number().int().nonnegative(),
});

const departmentPageSchema = z.strictObject({ items: z.array(departmentSchema), pagination });

const memberPageSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      employeeCode: z.string(),
      fullName: z.string(),
      status: z.enum(['ACTIVE', 'TERMINATED']),
      hasWorkEmail: z.boolean(),
      memberSince: z.string(),
    }),
  ),
  pagination,
});

const warningsSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      departmentId: z.uuid(),
      code: z.string(),
      name: z.string(),
      warning: z.enum(['MISSING_HEAD', 'MISSING_IT_ADMIN']),
    }),
  ),
  pagination,
});

export class CreateDepartmentBodyDto extends createZodDto(createDepartmentBodySchema) {}
export class UpdateDepartmentBodyDto extends createZodDto(updateDepartmentBodySchema) {}
export class ListDepartmentsQueryDto extends createZodDto(listDepartmentsQuerySchema) {}
export class ListMembersQueryDto extends createZodDto(listMembersQuerySchema) {}
export class ListWarningsQueryDto extends createZodDto(listMembersQuerySchema) {}
export class DepartmentIdParamDto extends createZodDto(departmentIdParamSchema) {}
export class AssignHeadBodyDto extends createZodDto(assignHeadBodySchema) {}
export class VacateHeadBodyDto extends createZodDto(vacateHeadBodySchema) {}
export class DepartmentResponseDto extends createZodDto(successEnvelopeSchema(departmentProfileSchema)) {}
export class DepartmentPageResponseDto extends createZodDto(successEnvelopeSchema(departmentPageSchema)) {}
export class DepartmentMembersResponseDto extends createZodDto(successEnvelopeSchema(memberPageSchema)) {}
export class DepartmentWarningsResponseDto extends createZodDto(successEnvelopeSchema(warningsSchema)) {}
