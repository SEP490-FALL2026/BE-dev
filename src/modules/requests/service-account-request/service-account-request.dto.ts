import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { PROJECT_LABEL_MAX_LENGTH, REASON_MAX_LENGTH, TERM_MONTHS_MAX } from '../access-request/access-request.dto';

/** The longest identifier a vendor keeps for an account: the bound of an address, as for any account of a seat. */
export const IDENTIFIER_MAX_LENGTH = 254;

/**
 * What a person fills to ask for a service account for themselves (`US-05-21` AC-1): the plan, what the non-human subject
 * is for, the identifier they expect it to have at the vendor, and what every request carries. Nothing here chooses the
 * branch, the Cost Center, who decides or who answers for the account: the system fixes them, and the sender answers.
 */
export const serviceAccountSubmitSchema = z.strictObject({
  planId: z.uuid(),
  purpose: z.string().trim().min(1).max(REASON_MAX_LENGTH),
  expectedIdentifier: z.string().trim().min(1).max(IDENTIFIER_MAX_LENGTH),
  businessReason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
  termMonths: z.number().int().min(1).max(TERM_MONTHS_MAX),
  projectLabel: z.string().trim().min(1).max(PROJECT_LABEL_MAX_LENGTH).optional(),
  /** The day the money is expected to go out (paid software only); it fixes the budget year. Today when left out. */
  expectedSpendOn: z.string().refine(isBusinessDate, { message: 'Must be a real date as YYYY-MM-DD.' }).optional(),
});

/** The verdict of the IT Admin: a refusal gives its reason, an acceptance gives none. */
export const serviceAccountReviewSchema = z
  .strictObject({
    decision: z.enum(['ACCEPT', 'REJECT']),
    reason: z.string().trim().min(1).max(REASON_MAX_LENGTH).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision === 'REJECT' && body.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A refusal gives its reason.' });
    }
    if (body.decision === 'ACCEPT' && body.reason !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Only a refusal gives a reason.' });
    }
  });

export class ServiceAccountSubmitBodyDto extends createZodDto(serviceAccountSubmitSchema) {}
export class ServiceAccountReviewBodyDto extends createZodDto(serviceAccountReviewSchema) {}
