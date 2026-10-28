import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';

/**
 * The causes of closing a request because of what became of the person it is for: they left the company (`US-03-04` AC-25), or they
 * were transferred to another department while the part not yet granted was still open (F29, `QĐ-90b`).
 */
export const CANCEL_CAUSES = ['BENEFICIARY_LEFT', 'BENEFICIARY_TRANSFERRED'] as const;

/**
 * The text a closing keeps: `note` is what the IT Admin keeps with the closing and is the reason of a closing for a transfer;
 * `evidence` is what they did to undo a grant that is being worked (took the invitation back, stopped the work), and, when the
 * person was transferred, the confirmation that they checked with the vendor and collected the invitation, which a task of the grant
 * that is still open needs whatever state it is in (`ACCESS_REQUEST.EVIDENCE_REQUIRED` otherwise).
 */
const closingFields = {
  note: z.string().trim().min(1).max(1000).optional(),
  evidence: z.string().trim().min(1).max(1000).optional(),
};

/** A closing for a transfer gives its reason: the note is required then (F29). */
export const transferNeedsReason = (
  body: { cause: (typeof CANCEL_CAUSES)[number]; note?: string },
  ctx: z.RefinementCtx,
): void => {
  if (body.cause === 'BENEFICIARY_TRANSFERRED' && body.note === undefined) {
    ctx.addIssue({ code: 'custom', path: ['note'], message: 'A closing for a transfer gives its reason.' });
  }
};

/** The body of closing a request because its beneficiary left or was transferred. */
export const cancelBodySchema = z
  .strictObject({ cause: z.enum(CANCEL_CAUSES), ...closingFields })
  .superRefine(transferNeedsReason);

export class CancelBodyDto extends createZodDto(cancelBodySchema) {}
