import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { REASON_MAX_LENGTH, requestSchema } from '../access-request/access-request.dto';

const reason = z.string().trim().min(1).max(REASON_MAX_LENGTH);

/**
 * What the holder of a right that ends on a day sends to renew it (`US-05-14` AC-1, `QĐ-111l`): the seat, the time of use they ask to go on
 * in months (or `longTerm` for a right with no end) and why. The end the right has now is not edited: the request is judged like any other,
 * and approval writes the record that follows. The end of the new period is worked out by the system, from the day after the right ends and
 * cut at the end of the contract of a person who has one (R-38). Only the holder sends it (`QĐ-100t`).
 */
export const renewalSubmitSchema = z
  .strictObject({
    assignmentId: z.uuid(),
    /**
     * The months of use to go on for (`QĐ-111i`): the rule of the kind of the plan judges the number when the request is sent, 1 to 9 for
     * a plan bought by the month and 1 to 12 for the others (422 `ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE`). Exactly one of this and
     * `longTerm`.
     */
    extensionMonths: z.number().int().optional(),
    /**
     * `true`: go on with no end (_Dùng lâu dài_), for a plan of seats or internal software; never for a person with a term (422
     * `ACCESS_REQUEST.TERM_LONG_TERM_NOT_ALLOWED`). Exactly one of this and `extensionMonths`.
     */
    longTerm: z.literal(true).optional(),
    businessReason: reason,
  })
  .refine((body) => (body.longTerm === undefined) !== (body.extensionMonths === undefined), {
    message: 'Give exactly one of extensionMonths and longTerm.',
    path: ['extensionMonths'],
  });

export class RenewalBodyDto extends createZodDto(renewalSubmitSchema) {}
/**
 * `RENEWAL_REQUESTED`: a request for the renewal was made and the seat stays as it is until it is decided. `NEW_REQUEST`: the right
 * had already ended, so what was made is a request for the tool like any other.
 */
export class RenewalResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({ outcome: z.enum(['RENEWAL_REQUESTED', 'NEW_REQUEST']), request: requestSchema }),
  ),
) {}
