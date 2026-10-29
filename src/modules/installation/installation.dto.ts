import { z } from 'zod';
import { businessDateAt, isBusinessDate, isValidTimeZone } from '../../core/business-date';
import { InvalidEmailError, normalizeEmail } from '../../core/email';

/** Words that mark a value as a stand-in rather than a real one (QĐ-67b: real values only). */
const PLACEHOLDER = /^(n\/?a|none|null|tbd|todo|test|placeholder|unknown|default|unclassified|chưa phân loại)$/i;

const code = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, 'use letters, digits, ".", "_" or "-" (max 32)');

const name = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !PLACEHOLDER.test(value), 'a real value is required, not a placeholder');

const email = z
  .string()
  .trim()
  .max(254)
  .refine((value) => {
    try {
      normalizeEmail(value);
      return true;
    } catch (error) {
      if (error instanceof InvalidEmailError) return false;
      throw error;
    }
  }, 'not a valid email address');

const employmentType = z.enum(['STAFF', 'CONTRACTOR', 'FREELANCER', 'INTERN']);

const employee = z.strictObject({
  employeeCode: code,
  fullName: name,
  workEmail: email,
  employmentType,
  hireDate: z.string().refine(isBusinessDate, 'must be a real date, YYYY-MM-DD'),
});

/**
 * What the installation command is given (`QĐ-87f`(1)): the organization, its first department and the person who will
 * hold the Super Admin role. There is no Cost Center (Finance creates it for a department that exists), no job title and no
 * IT employee, so a key for any of them is refused like every other unknown key (strict object).
 */
export const installationInputSchema = z
  .strictObject({
    timeZone: z.string().refine(isValidTimeZone, 'must be an IANA zone such as Asia/Ho_Chi_Minh'),
    reportingCurrency: z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code such as VND'),
    organizationName: name,
    departmentCode: code,
    departmentName: name,
    superAdmin: employee,
    /** Defaults to the Super Admin's work email. */
    loginEmail: email.optional(),
    operatorReference: z.string().trim().min(1).max(100),
    environment: z.enum(['LOCAL_TEST', 'SHARED']),
  })
  .superRefine((input, context) => {
    // A hire date must not be in the future in the organization's own calendar.
    if (isValidTimeZone(input.timeZone)) {
      const today = businessDateAt(new Date(), input.timeZone);
      if (isBusinessDate(input.superAdmin.hireDate) && input.superAdmin.hireDate > today) {
        context.addIssue({
          code: 'custom',
          path: ['superAdmin', 'hireDate'],
          message: `must not be after today (${today})`,
        });
      }
    }
  });

export type InstallationInput = z.infer<typeof installationInputSchema>;
