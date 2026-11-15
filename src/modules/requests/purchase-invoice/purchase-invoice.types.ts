import type { BusinessDate } from '../../../core/business-date';
import type { PurchaseInvoiceFlag, PurchaseInvoiceLabelResult } from './labels/purchase-invoice-labels.policy';
import type { OriginalPrice, PurchaseInvoiceMatch } from './purchase-invoice-match.policy';

/** The request or subscription an invoice is for, as the IT Admin works it. */
export type PurchaseInvoiceLink =
  | { kind: 'REQUEST'; requestId: string; provisioningTaskId: string | null }
  | { kind: 'SUBSCRIPTION'; subscriptionId: string };

/** What the invoice says in money: dong taken out, and the price of one in the currency it states. */
export interface PurchaseInvoiceMoney {
  netMinor: bigint;
  deductibleTaxMinor: bigint;
  nonDeductibleTaxMinor: bigint;
  unitPriceOriginal: OriginalPrice;
}

/** What a preview tells and what a submission keeps: the invoice read against its request or subscription, its invoices before, and the budget. */
export interface PurchaseInvoicePlan {
  organizationId: string;
  link: PurchaseInvoiceLink;
  vendorId: string;
  serviceMonth: BusinessDate;
  period: PurchaseInvoiceLabelResult;
  match: PurchaseInvoiceMatch;
  /** The Cost Center that bears the expense (`R-51`); null for an invoice of a subscription. */
  chargedCostCenterId: string | null;
  /** The commitment of the year of the service month this invoice goes into, and what is left of it; null when it goes nowhere into a commitment. */
  commitment: { id: string; remainingMinor: bigint } | null;
  flags: PurchaseInvoiceFlag[];
}
