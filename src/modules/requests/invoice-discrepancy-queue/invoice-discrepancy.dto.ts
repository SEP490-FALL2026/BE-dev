import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** What differs in one case: the count, the price of one, or the expected pool amount; each at most once. */
export const INVOICE_DISCREPANCY_MISMATCHES_MAX = 3;

const state = z.enum(['OPEN', 'CLOSED']);
const outcome = z.enum(['EXPLAINED', 'OUT_OF_PROCESS_SUSPECTED', 'EXCHANGE_RATE_LINE_PRICE_UPDATED']);
const mismatch = z.enum(['QUANTITY', 'UNIT_PRICE', 'EXPECTED_AMOUNT']);

const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
/** An amount in dong, as typed: no currency (`QĐ-111an`). */
const dongInput = z.strictObject({ amount: z.string().max(40) });

/** Finance closes the case: how, why, and the money it could not account for. */
export const invoiceDiscrepancyClosureSchema = z.strictObject({
  outcome: outcome.meta({
    description:
      'EXPLAINED when the difference has a reason; OUT_OF_PROCESS_SUSPECTED when someone may have paid for the software outside the process (it needs a difference above nothing, and is sent on to the review of the accounts at the vendor); EXCHANGE_RATE_LINE_PRICE_UPDATED when exchange rate or card fee differences require the responsible IT Admin to review the subscription monthly price.',
  }),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .meta({ description: 'Why the case is closed this way. Required; it stays with the case.' }),
  differenceAmount: dongInput.meta({
    description:
      'What the invoice cost beyond what was approved or bought, in dong (nothing is allowed for an explanation, never below nothing). The money is already in the expense of the invoice; this only records it.',
  }),
});

export const invoiceDiscrepancyListQuerySchema = z.strictObject({
  state: state.optional(),
  outcome: outcome.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const summarySchema = z.strictObject({
  id: z.uuid(),
  state,
  mismatches: z.array(mismatch).max(INVOICE_DISCREPANCY_MISMATCHES_MAX),
  openedAt: z.iso.datetime(),
  outcome: outcome.nullable(),
  purchaseInvoice: z.strictObject({
    id: z.uuid(),
    vendorId: z.uuid(),
    vendorInvoiceNumber: z.string(),
    servicePeriodMonth: z.string().meta({ description: 'The month the invoice pays for, as YYYY-MM.' }),
    linkKind: z.enum(['REQUEST', 'SUBSCRIPTION']),
    requestId: z.uuid().nullable(),
    subscriptionId: z.uuid().nullable(),
    netAmount: moneyView.meta({ description: 'What was taken out of the company in dong, before tax.' }),
  }),
  quantity: z.strictObject({
    invoice: z.number().int(),
    expected: z.number().int().nullable().meta({ description: 'The seats approved or bought; null when nobody knew.' }),
  }),
  unitPrice: z.strictObject({
    invoice: moneyView.meta({ description: 'The price of one the invoice states, in the currency it states.' }),
    expected: moneyView.nullable().meta({
      description: 'The price of one of the plan or subscription, in its original currency; null when nobody knew.',
    }),
  }),
});

const detailSchema = summarySchema.extend({
  closure: z
    .strictObject({
      outcome,
      reason: z.string(),
      differenceAmount: moneyView,
      closedBy: z.strictObject({ employeeId: z.uuid() }),
      closedAt: z.iso.datetime(),
    })
    .nullable()
    .meta({ description: 'How the case was closed; null while it is open.' }),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class InvoiceDiscrepancyIdParamDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}
export class InvoiceDiscrepancyClosureBodyDto extends createZodDto(invoiceDiscrepancyClosureSchema) {}
export class InvoiceDiscrepancyListQueryDto extends createZodDto(invoiceDiscrepancyListQuerySchema) {}
export class InvoiceDiscrepancyResponseDto extends createZodDto(successEnvelopeSchema(detailSchema)) {}
export class InvoiceDiscrepancyListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(summarySchema), pagination })),
) {}

export type InvoiceDiscrepancySummaryWire = z.infer<typeof summarySchema>;
export type InvoiceDiscrepancyDetailWire = z.infer<typeof detailSchema>;
