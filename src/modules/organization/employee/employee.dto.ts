import { z } from 'zod';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { hrBasisSchema } from '../../../infrastructure/http/dto/hr-basis.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { businessDateSchema } from '../../../infrastructure/http/dto/business-date.dto';

/** An address the one email rule cannot reduce (for example a name that is only a "+tag") can never be matched, so it is refused here. */
function canBeNormalized(email: string): boolean {
  try {
    normalizeEmail(email);

    return true;
  } catch (error) {
    if (error instanceof InvalidEmailError) return false;
    throw error;
  }
}

const employmentType = z.enum(['STAFF', 'CONTRACTOR', 'FREELANCER', 'INTERN']);

const WORK_EMAIL_DESCRIPTION =
  'An email address; surrounding whitespace is trimmed before it is checked. The part before any +tag must not be empty: ' +
  'an address that cannot be normalized for matching is refused.';

/**
 * The department and the job title are only bounded here, and may be missing: a missing or unknown department, a too long title
 * is a reason of the row (`DEPARTMENT_REQUIRED`, `JOB_TITLE_TOO_LONG`, ...), reported with the others, not a malformed request. The
 * job title is optional free text (`QĐ-87e`): none is not a fault. The Cost Center is never sent: it follows from the department,
 * and a department with none takes people in.
 */
export const createEmployeeBodySchema = z.strictObject({
  employeeCode: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(1).max(200),
  workEmail: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .refine(canBeNormalized, { message: 'workEmail cannot be normalized.' })
    .meta({ format: 'email', description: WORK_EMAIL_DESCRIPTION })
    .nullish(),
  employmentType,
  hireDate: businessDateSchema('hireDate must be a real date as YYYY-MM-DD.'),
  departmentCode: z.string().max(50).nullish(),
  jobTitle: z.string().max(1000).nullish(),
  /** The HR document the record is entered on (`US-02-02` AC-16): required. */
  hrBasis: hrBasisSchema,
});

/**
 * What the Super Admin may correct of a record that exists (`US-02-02` AC-19, `QĐ-87a`): the official fields, among them the free-text
 * job title (`null` clears it), always on an HR basis. Any other field, among them the department and the status, is refused as unknown.
 */
export const updateEmployeeBodySchema = z.strictObject({
  fullName: z.string().trim().min(1).max(200).optional(),
  workEmail: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .refine(canBeNormalized, { message: 'workEmail cannot be normalized.' })
    .meta({ format: 'email', description: WORK_EMAIL_DESCRIPTION })
    .nullable()
    .optional(),
  employmentType: employmentType.optional(),
  hireDate: businessDateSchema('hireDate must be a real date as YYYY-MM-DD.').optional(),
  jobTitle: z.string().max(1000).nullable().optional(),
  hrBasis: hrBasisSchema,
});
export const employeeIdParamSchema = z.strictObject({ id: z.uuid() });

const employeeWorkState = z.enum(['WORKING', 'ON_LONG_LEAVE', 'HANDING_OVER', 'LEFT']);

const employeeSchema = z.strictObject({
  id: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  workEmail: z.string().nullable(),
  employmentType,
  hireDate: z.string(),
  status: z.literal('ACTIVE'),
  workState: z.literal('WORKING'),
  memberSince: z.string(),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  jobTitle: z.string().nullable(),
});

export class CreateEmployeeBodyDto extends createZodDto(createEmployeeBodySchema) {}
export class EmployeeResponseDto extends createZodDto(successEnvelopeSchema(employeeSchema)) {}
export class UpdateEmployeeBodyDto extends createZodDto(updateEmployeeBodySchema) {}
export class EmployeeIdParamDto extends createZodDto(employeeIdParamSchema) {}

const maintainedEmployeeSchema = z.strictObject({
  id: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  workEmail: z.string().nullable(),
  employmentType,
  hireDate: z.string(),
  jobTitle: z.string().nullable(),
  status: z.enum(['ACTIVE', 'TERMINATED']),
  workState: employeeWorkState,
});
export class MaintainedEmployeeResponseDto extends createZodDto(successEnvelopeSchema(maintainedEmployeeSchema)) {}
