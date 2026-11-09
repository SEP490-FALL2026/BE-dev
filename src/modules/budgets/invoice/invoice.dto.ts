import { z } from 'zod';
import { responseBusinessDate, businessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { commitmentResponseSchema } from '../commitment/commitment.dto';

/** An amount Finance types: in the currency of the commitment, which the client never names (`currency` is refused). */
const amountInput = z.strictObject({ amount: z.string().max(40) });
const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });

/**
 * Finance records an invoice against a commitment (`US-12-02`). The price is the one on the invoice before tax; the tax that can be
 * deducted is shown apart and is not an expense; the tax that cannot be deducted is an expense. The currency is the commitment's, the
 * vendor is the one of the request behind it.
 */
export const invoiceBodySchema = z.strictObject({
  number: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .meta({ description: 'The number on the invoice; recorded once for the vendor.' }),
  issuedOn: businessDate,
  netAmount: amountInput.meta({ description: 'The price on the invoice before tax, more than nothing.' }),
  deductibleTax: amountInput
    .meta({ description: 'Tax that can be deducted: shown apart and not an expense. Nothing when left out.' })
    .optional(),
  nonDeductibleTax: amountInput
    .meta({ description: 'Tax that cannot be deducted: an expense. Nothing when left out.' })
    .optional(),
  note: z.string().trim().min(1).max(1000).optional(),
});

export const invoiceListQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const invoiceSchema = z.strictObject({
  id: z.uuid(),
  number: z.string(),
  issuedOn: responseBusinessDate,
  netAmount: moneyView,
  deductibleTax: moneyView,
  nonDeductibleTax: moneyView,
  /** What the invoice cost the company: the price before tax and the tax that cannot be deducted. */
  actualCost: moneyView,
  matchResult: z.enum(['MATCHED', 'TAX_ONLY', 'PRICE_QUANTITY_EXCEPTION']),
  note: z.string().nullable(),
  recordedBy: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }).nullable(),
  recordedAt: z.iso.datetime(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class InvoiceBodyDto extends createZodDto(invoiceBodySchema) {}
export class InvoiceListQueryDto extends createZodDto(invoiceListQuerySchema) {}
export class InvoiceRecordedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ invoice: invoiceSchema, commitment: commitmentResponseSchema })),
) {}
export class InvoiceListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(invoiceSchema), pagination })),
) {}

export type InvoiceWire = z.infer<typeof invoiceSchema>;
