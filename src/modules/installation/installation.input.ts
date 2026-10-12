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

export const installationInputSchema = z
  .strictObject({
    timeZone: z.string().refine(isValidTimeZone, 'must be an IANA zone such as Asia/Ho_Chi_Minh'),
    reportingCurrency: z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code such as VND'),
    organizationName: name,
    costCenterCode: code,
    costCenterName: name,
    departmentCode: code,
    departmentName: name,
    jobTitleName: name,
    superAdmin: employee,
    /** Defaults to the Super Admin's work email. */
    loginEmail: email.optional(),
    itAdmin: employee,
    operatorReference: z.string().trim().min(1).max(100),
    environment: z.enum(['LOCAL_TEST', 'SHARED']),
  })
  .superRefine((input, context) => {
    if (input.superAdmin.employeeCode.toLowerCase() === input.itAdmin.employeeCode.toLowerCase()) {
      context.addIssue({
        code: 'custom',
        path: ['itAdmin', 'employeeCode'],
        message: 'must differ from the Super Admin code',
      });
    }
    if (isSameEmail(input.superAdmin.workEmail, input.itAdmin.workEmail)) {
      context.addIssue({
        code: 'custom',
        path: ['itAdmin', 'workEmail'],
        message: 'must differ from the Super Admin email',
      });
    }

    // A hire date must not be in the future in the organization's own calendar.
    if (isValidTimeZone(input.timeZone)) {
      const today = businessDateAt(new Date(), input.timeZone);
      for (const key of ['superAdmin', 'itAdmin'] as const) {
        if (isBusinessDate(input[key].hireDate) && input[key].hireDate > today) {
          context.addIssue({ code: 'custom', path: [key, 'hireDate'], message: `must not be after today (${today})` });
        }
      }
    }
  });

export type InstallationInput = z.infer<typeof installationInputSchema>;

function isSameEmail(a: string, b: string): boolean {
  try {
    return normalizeEmail(a) === normalizeEmail(b);
  } catch {
    return false;
  }
}
