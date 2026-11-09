import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { REASON_MAX_LENGTH, requestSchema } from '../access-request/access-request.dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

const reason = z.string().trim().min(1).max(REASON_MAX_LENGTH);

/**
 * What the holder of a right that ends on a day sends to renew it (`US-05-14` AC-1): the seat,
 * the end it asks for and why. The end the right has now is not edited: the request is judged like any other, and approval writes
 * the record that follows. Only the holder sends it (`QĐ-100t`).
 */
export const renewalSubmitSchema = z
  .strictObject({
    assignmentId: z.uuid(),
    /**
     * The new end of the right, as the holder enters it (`BR-MF1-08b`): after the end it has and at most twelve months after it (422
     * `RENEWAL_REQUEST.END_DATE_OUT_OF_RANGE`); the months are worked out by the system. Exactly one of this and `extensionMonths`.
     */
    newEndDate: businessDate.optional(),
    /** Deprecated: how many months more the holder wants, kept for the clients of before `newEndDate`. Exactly one of the two. */
    extensionMonths: z.number().int().min(1).max(12).optional(),
    businessReason: reason,
    /**
     * GH-3 (`BR-MF1-01g`): used only when the right has already ended and the ask becomes a request for new access, and the holder
     * then uses as many paid applications as the threshold; ignored otherwise.
     */
    manyPaidSoftwareReason: reason.optional(),
  })
  .refine((body) => (body.newEndDate === undefined) !== (body.extensionMonths === undefined), {
    message: 'Give exactly one of newEndDate and extensionMonths.',
    path: ['newEndDate'],
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
