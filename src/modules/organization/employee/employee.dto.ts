import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { hrBasisSchema } from '../../../infrastructure/http/dto/hr-basis.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

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

/**
 * The department and the job title are only bounded here, and may be missing: a missing or unknown one is a
 * reason of the row (`DEPARTMENT_REQUIRED`, `JOB_TITLE_NOT_FOUND`, ...), reported with the others, not a malformed
 * request. The Cost Center is never sent: it follows from the department.
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
    .nullish(),
  employmentType,
  hireDate: z.string().refine(isBusinessDate, { message: 'hireDate must be a real date as YYYY-MM-DD.' }),
  departmentCode: z.string().max(50).nullish(),
  jobTitleId: z.string().max(64).nullish(),
  /** The HR document the record is entered on (`US-02-02` AC-16): required. */
  hrBasis: hrBasisSchema,
});

/**
 * What an IT Admin may correct of a record that exists (`US-02-02` AC-19): the four official fields, always on an HR
 * basis. Any other field, among them the department, the title and the status, is refused as unknown.
 */
export const updateEmployeeBodySchema = z.strictObject({
  fullName: z.string().trim().min(1).max(200).optional(),
  workEmail: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .refine(canBeNormalized, { message: 'workEmail cannot be normalized.' })
    .nullable()
    .optional(),
  employmentType: employmentType.optional(),
  hireDate: z.string().refine(isBusinessDate, { message: 'hireDate must be a real date as YYYY-MM-DD.' }).optional(),
  hrBasis: hrBasisSchema,
});
export const employeeIdParamSchema = z.strictObject({ id: z.uuid() });

const employeeSchema = z.strictObject({
  id: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  workEmail: z.string().nullable(),
  employmentType,
  hireDate: z.string(),
  status: z.literal('ACTIVE'),
  memberSince: z.string(),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  jobTitle: z.strictObject({ id: z.uuid(), name: z.string() }),
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
  status: z.enum(['ACTIVE', 'TERMINATED']),
});
export class MaintainedEmployeeResponseDto extends createZodDto(successEnvelopeSchema(maintainedEmployeeSchema)) {}
