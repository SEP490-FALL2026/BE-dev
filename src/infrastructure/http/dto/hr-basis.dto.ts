import { z } from 'zod';
import { businessDateSchema } from './business-date.dto';

/**
 * The HR basis a `/projects` write still cites until `qd93-remove-department-projects` removes those routes (and this file with
 * them). No employee, department, head or import write takes one since `QĐ-93f`. It is only a reference; whether the document
 * exists is HR's to say.
 */
export const hrBasisSchema = z.strictObject({
  type: z.string().trim().min(1).max(100),
  reference: z.string().trim().min(1).max(200),
  issuer: z.string().trim().min(1).max(200),
  issuedOn: businessDateSchema('issuedOn must be a real date as YYYY-MM-DD.'),
});
