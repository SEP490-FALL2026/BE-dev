import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { employeeIdParamSchema } from '../employee/employee.dto';
import { EMPLOYEE_PLACEMENT_HISTORY_LIMIT } from './employee-directory.types';

export { employeeIdParamSchema };
export class EmployeeDirectoryIdParamDto extends createZodDto(employeeIdParamSchema) {}

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const employeeListQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  departmentId: z.uuid().optional(),
  unplaced: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  workState: z.enum(['WORKING', 'ON_LONG_LEAVE', 'HANDING_OVER', 'LEFT']).optional(),
  employmentType: z.enum(['STAFF', 'CONTRACTOR', 'FREELANCER', 'INTERN']).optional(),
  hasAccount: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export class EmployeeListQueryDto extends createZodDto(employeeListQuerySchema) {}

const departmentRefSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});

const accountSummarySchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(['ACTIVE', 'LOCKED']),
  activationState: z.enum(['INVITED', 'ACTIVATED']),
  employeeLeft: z.boolean(),
});

export const appRoleSchema = z.enum(['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER']);

const accountDetailSchema = accountSummarySchema.extend({
  roles: z.array(appRoleSchema).max(6),
});

export const employeeSummarySchema = z.strictObject({
  id: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  workEmail: z.string().nullable(),
  employmentType: z.enum(['STAFF', 'CONTRACTOR', 'FREELANCER', 'INTERN']),
  status: z.enum(['ACTIVE', 'TERMINATED']),
  workState: z.enum(['WORKING', 'ON_LONG_LEAVE', 'HANDING_OVER', 'LEFT']),
  hireDate: z.string(),
  jobTitle: z.string().nullable(),
  department: departmentRefSchema.nullable(),
  unplaced: z.boolean(),
  account: accountSummarySchema.nullable(),
});

export const employeePlacementHistoryItemSchema = z.strictObject({
  department: departmentRefSchema,
  validFrom: z.string(),
  validTo: z.string().nullable(),
});

export const employeeDetailSchema = employeeSummarySchema.extend({
  placements: z.array(employeePlacementHistoryItemSchema).max(EMPLOYEE_PLACEMENT_HISTORY_LIMIT),
  placementsHasMore: z.boolean(),
  account: accountDetailSchema.nullable(),
});

export const employeeListPageSchema = z.strictObject({
  items: z.array(employeeSummarySchema),
  pagination,
});

export class EmployeeListResponseDto extends createZodDto(successEnvelopeSchema(employeeListPageSchema)) {}
export class EmployeeDetailResponseDto extends createZodDto(successEnvelopeSchema(employeeDetailSchema)) {}
