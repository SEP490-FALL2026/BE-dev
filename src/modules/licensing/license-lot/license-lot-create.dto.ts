import { z } from 'zod';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** The most licenses one lot holds. */
export const LICENSE_LOT_LICENSES_MAX = 10_000;
const money = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) });
const unitPrice = money.meta({
  description:
    'The price of one license before tax, in dong: a decimal string in major units, currency VND. Another currency is refused.',
});
const originalUnitPrice = money.meta({
  description:
    'The price the vendor quoted in another currency, kept beside the price in dong: only kept, never converted.',
});

export const createLicenseLotBodySchema = z.strictObject({
  planId: z.uuid(),
  purchasedOn: businessDate,
  licenseCount: z.number().int().min(1).max(LICENSE_LOT_LICENSES_MAX),
  unitPrice,
  originalUnitPrice: originalUnitPrice.optional(),
  purpose: z.enum(['REQUEST', 'REPLACEMENT', 'STOCK']).meta({
    description:
      'Why the lot is bought: for a request (a plan whose key is given to an account), to replace keys that failed, or to keep in stock (a plan whose key goes on a machine). The opening lots are made by the move of the data, not by this route.',
  }),
  requestId: z
    .uuid()
    .optional()
    .meta({ description: 'The request a lot bought for a request is for; sent exactly when the purpose is REQUEST.' }),
  workspaceId: z.uuid().optional().meta({
    description:
      'The workspace the lot is held in; its vendor must be the vendor of the plan. Left out, a plan the company administers at the vendor takes the only workspace of the vendor; with several the caller must say which.',
  }),
  contractId: z.uuid().optional(),
  note: z.string().trim().min(1).max(1000).optional(),
});

export class CreateLicenseLotBodyDto extends createZodDto(createLicenseLotBodySchema) {}
export class LicenseLotCreatedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ id: z.uuid() })),
) {}
