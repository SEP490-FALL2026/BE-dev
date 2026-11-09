import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { DEPARTMENT_FUNCTION_MAX_LENGTH, DEPARTMENT_NAME_MAX_LENGTH } from '../department/department.types';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';

/**
 * The schema is the real limit of the name and the function: accents are composed (NFC) and the ends trimmed before the length is
 * counted, so a name typed in NFD form is not refused for its length; too long ⟹ VALIDATION_ERROR, and OpenAPI carries the limit
 * (`API-DOC-F05`). Whether a name is empty is the service's to say (`DEPARTMENT.NAME_INVALID`). No HR basis since `QĐ-93f`: a
 * body that still carries one is an unknown field.
 */
export const createDepartmentBodySchema = z.strictObject({
  code: z.string().meta({
    minLength: 2,
    maxLength: 20,
    pattern: '^[A-Z0-9]+(-[A-Z0-9]+)*$',
    description:
      '2 to 20 ASCII letters or digits in hyphen-separated groups; lowercase is accepted and converted to uppercase, e.g. p-eng becomes P-ENG.',
  }),
  name: z.string().normalize('NFC').trim().max(DEPARTMENT_NAME_MAX_LENGTH),
  function: z.string().normalize('NFC').trim().max(DEPARTMENT_FUNCTION_MAX_LENGTH).nullish(),
  itAdminEmployeeId: z.uuid().nullish(),
});

/** A department has no parent and its Cost Center cannot change: neither is a field (US-03-06 AC-3, AC-4). Same limits as creating. */
export const updateDepartmentBodySchema = z.strictObject({
  name: z.string().normalize('NFC').trim().max(DEPARTMENT_NAME_MAX_LENGTH).optional(),
  function: z.string().normalize('NFC').trim().max(DEPARTMENT_FUNCTION_MAX_LENGTH).nullable().optional(),
  itAdminEmployeeId: z.uuid().nullable().optional(),
});

/**
 * Retiring a department and taking back a successor take nothing: the body is empty or absent, and a key is refused like any
 * unknown field (`QĐ-93f`).
 */
const emptyBodySchema = z.preprocess((body) => body ?? {}, z.strictObject({}));
export const deactivateDepartmentBodySchema = emptyBodySchema;

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

export const assignHeadBodySchema = z.strictObject({
  employeeId: z.uuid(),
  effectiveFrom: businessDate,
});
export const vacateHeadBodySchema = z.strictObject({ effectiveFrom: businessDate });
/** The person who is to follow the head, from a day after today (`QĐ-87`). */
export const designateSuccessorBodySchema = z.strictObject({
  employeeId: z.uuid(),
  effectiveFrom: businessDate,
});
export const clearSuccessorBodySchema = emptyBodySchema;

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
  /** The Cost Center Finance created for the department and that is in use; null while it has none (`QĐ-87d(1)`). */
  costCenter: z
    .strictObject({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      status: z.enum(['ACTIVE', 'INACTIVE']),
    })
    .nullable(),
  itAdmin: z
    .strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string(), usable: z.boolean() })
    .nullable(),
  head: z
    .strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string(), since: z.string() })
    .nullable(),
  memberCount: z.number().int().nonnegative(),
  /** What the department still lacks: a head, a usable IT Admin in charge, a Cost Center in use (finance configuration incomplete). */
  warnings: z.array(z.enum(['MISSING_HEAD', 'MISSING_IT_ADMIN', 'MISSING_COST_CENTER'])),
  /** The day the department takes effect (`QĐ-104e(3)`): one made for next year takes effect on 1 January, before that it takes no member. */
  effectiveFrom: responseBusinessDate,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deactivatedAt: z.iso.datetime().nullable(),
});

const departmentProfileSchema = departmentSchema.extend({
  /** The person named to take over from a day after today (`since` is that day); null when nobody is. */
  successor: z
    .strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string(), since: z.string() })
    .nullable(),
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
});

const departmentPageSchema = z.strictObject({ items: z.array(departmentSchema), pagination });

const memberPageSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      employeeId: z.uuid(),
      employeeCode: z.string(),
      fullName: z.string(),
      status: z.enum(['ACTIVE', 'TERMINATED']),
      workState: z.enum(['WORKING', 'ON_LONG_LEAVE', 'HANDING_OVER', 'LEFT']),
      hasWorkEmail: z.boolean(),
      memberSince: z.string(),
    }),
  ),
  pagination,
});

/** What an IT Admin may read of a person (`EmployeeTechnicalView`): no email, no kind of staff, no hire date, no basis. */
const technicalMemberPageSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      code: z.string(),
      fullName: z.string(),
      departmentId: z.uuid(),
      employmentStatus: z.enum(['WORKING', 'ON_LONG_LEAVE', 'HANDING_OVER', 'LEFT']),
      effectiveOn: z.string(),
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
export class DeactivateDepartmentBodyDto extends createZodDto(deactivateDepartmentBodySchema) {}
export class AssignHeadBodyDto extends createZodDto(assignHeadBodySchema) {}
export class VacateHeadBodyDto extends createZodDto(vacateHeadBodySchema) {}
export class DesignateSuccessorBodyDto extends createZodDto(designateSuccessorBodySchema) {}
export class ClearSuccessorBodyDto extends createZodDto(clearSuccessorBodySchema) {}
export class DepartmentResponseDto extends createZodDto(successEnvelopeSchema(departmentProfileSchema)) {}
export class DepartmentPageResponseDto extends createZodDto(successEnvelopeSchema(departmentPageSchema)) {}
export class DepartmentMembersResponseDto extends createZodDto(successEnvelopeSchema(memberPageSchema)) {}
export class DepartmentTechnicalMembersResponseDto extends createZodDto(
  successEnvelopeSchema(technicalMemberPageSchema),
) {}
export class DepartmentWarningsResponseDto extends createZodDto(successEnvelopeSchema(warningsSchema)) {}
