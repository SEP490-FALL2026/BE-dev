import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { REASON_MAX_LENGTH, requestSchema } from '../access-request/access-request.dto';

const reason = z.string().trim().min(1).max(REASON_MAX_LENGTH);

/**
 * What the holder of a right that ends on a day sends to renew it (`US-05-14` AC-1): the seat,
 * the end it asks for and why. The end the right has now is not edited: the request is judged like any other, and approval writes
 * the record that follows. Only the holder sends it (`QĐ-100t`).
 */
export const renewalSubmitSchema = z.strictObject({
  assignmentId: z.uuid(),
  /** How many months more the holder wants; the new end day is worked out from the day the right ends (`QĐ-98`). */
  extensionMonths: z.number().int().min(1).max(12),
  businessReason: reason,
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
