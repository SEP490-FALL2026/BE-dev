import { z } from 'zod';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** The most files that come with one purchase invoice (`D9`). */
export const PURCHASE_INVOICE_DOCUMENTS_MAX = 20;
/** The most subscription lines covered by one split period invoice. */
export const PURCHASE_INVOICE_LINES_MAX = 20;
/** The most marks laid on one invoice: over what was approved, outside the term, or missing expected pool amount. */
export const PURCHASE_INVOICE_FLAGS_MAX = 3;

const label = z.enum(['NEW_PURCHASE', 'PERIOD', 'RENEWAL', 'SEAT_PURCHASE']);
const state = z.enum(['SUBMITTED', 'CONFIRMED', 'RETURNED']);
const matchResult = z.enum(['MATCHED', 'PRICE_QUANTITY_EXCEPTION']);
const flag = z.enum(['OVER_APPROVED', 'OUTSIDE_TERM', 'NO_EXPECTED_AMOUNT']);
const paymentSource = z.enum(['COMPANY_CARD', 'IT_ADVANCE']);

/** An amount in dong, as typed: what the card took out of the company, fees and exchange loss included. */
const dongInput = z.strictObject({ amount: z.string().max(40) });
const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
/** A month as `YYYY-MM`, judged by the rule and not by a pattern the document would repeat. */
const serviceMonth = z
  .string()
  .refine((value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value), { message: 'Must be a month as YYYY-MM.' })
  .meta({ description: 'A calendar month as YYYY-MM.' });

const link = z
  .strictObject({
    requestId: z.uuid().optional().meta({ description: 'The request the purchase was approved for.' }),
    provisioningTaskId: z
      .uuid()
      .optional()
      .meta({ description: 'The task of the grant the purchase belongs to; only with a request.' }),
    subscriptionId: z
      .uuid()
      .optional()
      .meta({ description: 'The subscription the invoice renews; instead of a request or a license lot.' }),
    licenseLotId: z
      .uuid()
      .optional()
      .meta({ description: 'The license lot the invoice pays for; instead of a request or a subscription.' }),
    seatPurchaseId: z
      .uuid()
      .optional()
      .meta({ description: 'The seat purchase recorded on this subscription; only with a subscription.' }),
    subscriptionLineIds: z
      .array(z.uuid())
      .min(1)
      .max(PURCHASE_INVOICE_LINES_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Each subscription line may appear only once.' })
      .meta({
        uniqueItems: true,
        description: 'Selected subscription lines covered by a split period invoice; only with a subscription.',
      })
      .optional(),
  })
  .refine(
    (value) =>
      [value.requestId, value.subscriptionId, value.licenseLotId].filter((v) => v !== undefined).length === 1 &&
      (value.provisioningTaskId === undefined || value.requestId !== undefined) &&
      (value.seatPurchaseId === undefined || value.subscriptionId !== undefined) &&
      (value.subscriptionLineIds === undefined || value.subscriptionId !== undefined) &&
      !(value.seatPurchaseId !== undefined && value.subscriptionLineIds !== undefined),
    {
      message:
        'Name exactly one of a request (with optional task), a subscription (with optional seatPurchaseId or subscriptionLineIds), or a license lot.',
    },
  );

/** What the invoice says and how it was paid, the same for a preview, a submission and a new submission of a returned one. */
const invoiceFields = {
  vendorInvoiceNumber: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .meta({ description: 'The number on the invoice; one vendor has it once until the invoice is returned.' }),
  issuedOn: businessDate,
  servicePeriodMonth: serviceMonth.meta({
    description:
      'The month the invoice pays for. The expense belongs to the month and the year of it, whatever day the invoice is dated.',
  }),
  quantity: z.number().int().min(1).max(1_000_000).meta({ description: 'The seats or keys the invoice says.' }),
  unitPriceOriginal: z.strictObject({ amount: z.string().max(40), currency: z.string().length(3) }).meta({
    description:
      'The price of one on the invoice, in the currency it states: what the plan is compared with, never converted.',
  }),
  netAmount: dongInput.meta({ description: 'What was taken out of the company in dong for the goods, before tax.' }),
  deductibleTax: dongInput
    .meta({ description: 'Tax that can be deducted: shown apart, not an expense. Nothing when left out.' })
    .optional(),
  nonDeductibleTax: dongInput
    .meta({ description: 'Tax that cannot be deducted: an expense. Nothing when left out.' })
    .optional(),
  paymentSource,
};

/** The form without files: what the preview reads. */
export const purchaseInvoicePreviewSchema = z.strictObject({ link, ...invoiceFields });

/** The submission: the form with one to twenty files, each a finished upload of purpose `PURCHASE_DOCUMENT` of the person who submits. */
export const purchaseInvoiceSubmitSchema = z.strictObject({
  link,
  ...invoiceFields,
  documentIds: z.array(z.uuid()).min(1).max(PURCHASE_INVOICE_DOCUMENTS_MAX),
});

/** A new submission of a returned invoice: it keeps the link, and says the rest again with its own files. */
export const purchaseInvoiceResubmitSchema = z.strictObject({
  ...invoiceFields,
  documentIds: z.array(z.uuid()).min(1).max(PURCHASE_INVOICE_DOCUMENTS_MAX),
});

export const purchaseInvoiceListQuerySchema = z.strictObject({
  state: state.optional(),
  label: label.optional(),
  vendorId: z.uuid().optional(),
  subscriptionId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  servicePeriodMonth: serviceMonth.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const purchaseInvoiceMissingPeriodQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const planView = z.strictObject({
  label,
  servicePeriodMonth: serviceMonth,
  periodIndex: z.number().int().positive().nullable(),
  periodCount: z.number().int().positive().nullable(),
  matchResult,
  flags: z.array(flag).max(PURCHASE_INVOICE_FLAGS_MAX),
});

const personRef = z.strictObject({ employeeId: z.uuid() });

/** A purchase invoice as the list shows it. */
const summarySchema = planView.extend({
  id: z.uuid(),
  state,
  linkKind: z.enum(['REQUEST', 'SUBSCRIPTION', 'LICENSE_LOT']),
  requestId: z.uuid().nullable(),
  subscriptionId: z.uuid().nullable(),
  vendorId: z.uuid(),
  vendorInvoiceNumber: z.string(),
  issuedOn: responseBusinessDate,
  quantity: z.number().int().positive(),
  netAmount: moneyView,
  paymentSource,
  submittedBy: personRef,
  submittedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});

/** One purchase invoice with everything it says and what became of it. */
const detailSchema = summarySchema.extend({
  provisioningTaskId: z.uuid().nullable(),
  seatPurchaseId: z.uuid().nullable(),
  licenseLotId: z.uuid().nullable(),
  unitPriceOriginal: moneyView,
  deductibleTax: moneyView,
  nonDeductibleTax: moneyView,
  chargedCostCenterId: z.uuid().nullable().meta({
    description:
      'The Cost Center that bears the expense: the department that held the right in the month of the period.',
  }),
  decidedBy: personRef.nullable(),
  returnReason: z.string().nullable(),
  resubmissionOfId: z.uuid().nullable(),
  resubmittedAsId: z.uuid().nullable(),
  invoiceId: z.uuid().nullable().meta({ description: 'The invoice written when Finance signed; null before.' }),
  poolExpected: moneyView.nullable().meta({
    description: 'The expected amount in dong for a pooled-quota seat invoice; null when absent or not applicable.',
  }),
  poolVariance: moneyView.nullable().meta({
    description:
      'Actual cost minus expected amount in dong for a pooled-quota seat invoice; equals actual cost when expected is null, and null before confirmation or when not applicable.',
  }),
  documents: z
    .array(
      z.strictObject({ documentId: z.uuid(), position: z.number().int().min(1).max(PURCHASE_INVOICE_DOCUMENTS_MAX) }),
    )
    .max(PURCHASE_INVOICE_DOCUMENTS_MAX),
});

/** A period of a right paid by the month or the year whose invoice has not come past its due day. */
const missingPeriodSchema = z.strictObject({
  linkKind: z.enum(['REQUEST', 'SUBSCRIPTION']),
  requestId: z.uuid().nullable(),
  subscriptionId: z.uuid().nullable(),
  label,
  servicePeriodMonth: serviceMonth,
  periodIndex: z.number().int().positive().nullable(),
  periodCount: z.number().int().positive().nullable(),
  paymentDate: responseBusinessDate,
  dueDate: responseBusinessDate,
  plan: z.strictObject({
    planId: z.uuid(),
    planName: z.string(),
    applicationName: z.string(),
    logoUrl: z.string().nullable().meta({
      description:
        'The https link to the logo image of the application that the IT Admin pasted, or null. The server never checks it: it may be broken, so show the first letter of the name when the image does not load.',
    }),
  }),
  department: z.strictObject({ id: z.uuid(), name: z.string() }).nullable().meta({
    description:
      'The department of the request; null for the invoice of a subscription period, which has no owning department.',
  }),
});

const previewSchema = planView.extend({
  chargedCostCenter: z.strictObject({ id: z.uuid() }).nullable(),
  commitment: z.strictObject({ id: z.uuid(), remaining: moneyView }).nullable(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class PurchaseInvoiceIdParamDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}
export class PurchaseInvoicePreviewBodyDto extends createZodDto(purchaseInvoicePreviewSchema) {}
export class PurchaseInvoiceSubmitBodyDto extends createZodDto(purchaseInvoiceSubmitSchema) {}
export class PurchaseInvoiceResubmitBodyDto extends createZodDto(purchaseInvoiceResubmitSchema) {}
export class PurchaseInvoiceListQueryDto extends createZodDto(purchaseInvoiceListQuerySchema) {}
export class PurchaseInvoiceMissingPeriodQueryDto extends createZodDto(purchaseInvoiceMissingPeriodQuerySchema) {}
export class PurchaseInvoicePreviewResponseDto extends createZodDto(successEnvelopeSchema(previewSchema)) {}
export class PurchaseInvoiceResponseDto extends createZodDto(successEnvelopeSchema(detailSchema)) {}
export class PurchaseInvoiceListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(summarySchema), pagination })),
) {}

export class PurchaseInvoiceMissingPeriodListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(missingPeriodSchema), pagination })),
) {}

export type PurchaseInvoiceSummaryWire = z.infer<typeof summarySchema>;
export type PurchaseInvoiceMissingPeriodWire = z.infer<typeof missingPeriodSchema>;
export type PurchaseInvoiceDetailWire = z.infer<typeof detailSchema>;
export type PurchaseInvoicePreviewWire = z.infer<typeof previewSchema>;
export type PurchaseInvoiceFormInput = z.infer<typeof purchaseInvoicePreviewSchema>;
export type PurchaseInvoiceSubmitInput = z.infer<typeof purchaseInvoiceSubmitSchema>;
