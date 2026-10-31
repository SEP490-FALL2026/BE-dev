import { z } from 'zod';
import { businessDateSchema } from './business-date.dto';

/**
 * The HR basis of a new employee record (`US-02-02` AC-16): every part is required, and a missing one is named by the
 * validation error. It is only a reference; whether the document exists is HR's to say.
 */
export const hrBasisSchema = z.strictObject({
  type: z.string().trim().min(1).max(100),
  reference: z.string().trim().min(1).max(200),
  issuer: z.string().trim().min(1).max(200),
  issuedOn: businessDateSchema('issuedOn must be a real date as YYYY-MM-DD.'),
});
