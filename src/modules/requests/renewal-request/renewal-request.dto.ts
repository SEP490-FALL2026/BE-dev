import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { PROJECT_LABEL_MAX_LENGTH, REASON_MAX_LENGTH, requestSchema } from '../access-request/access-request.dto';

const businessDate = z.string().refine(isBusinessDate, { message: 'Must be a real date as YYYY-MM-DD.' });
const reason = z.string().trim().min(1).max(REASON_MAX_LENGTH);

/**
 * What the holder of a right that ends on a day, or the head of their department, sends to renew it (`US-05-14` AC-1): the seat,
 * the end it asks for and why. The end the right has now is not edited: the request is judged like any other, and approval writes
 * the record that follows. `termConfirmation` is for a head who sends it and asks for more than twelve months in all, as the head
 * who decides would confirm it; `outsideStandardReason` is for the request that follows when the right had already ended.
 */
export const renewalSubmitSchema = z.strictObject({
  assignmentId: z.uuid(),
  newExpectedEndDate: businessDate,
  businessReason: reason,
  projectLabel: z.string().trim().min(1).max(PROJECT_LABEL_MAX_LENGTH).optional(),
  /** The day the money is expected to go out (paid software only); it fixes the budget year. Today when left out. */
  expectedSpendOn: businessDate.optional(),
  termConfirmation: z.strictObject({ reason }).optional(),
  outsideStandardReason: reason.optional(),
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
