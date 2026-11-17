import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });

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
  servicePeriodMonth: z.string().nullable().meta({
    description: 'The month the invoice pays for, as YYYY-MM; empty for an invoice booked before the month was kept.',
  }),
  label: z.enum(['NEW_PURCHASE', 'PERIOD', 'RENEWAL']).nullable().meta({
    description:
      'What the purchase was: a new purchase, a later period of one, or a renewal; empty for an invoice that is not of a purchase invoice.',
  }),
  paymentSource: z
    .enum(['COMPANY_CARD', 'IT_ADVANCE'])
    .nullable()
    .meta({ description: 'How the purchase was paid; empty for an invoice that is not of a purchase invoice.' }),
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

export class InvoiceListQueryDto extends createZodDto(invoiceListQuerySchema) {}
export class InvoiceListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(invoiceSchema), pagination })),
) {}

export type InvoiceWire = z.infer<typeof invoiceSchema>;
