import type { BusinessDate } from '../../../core/business-date';
import type {
  PurchaseInvoiceFlag,
  PurchaseInvoiceLabel,
  PurchaseInvoiceLabelResult,
} from './labels/purchase-invoice-labels.policy';
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
  /** What the invoice was read against: the seats or the count bought, and the price of one in its original currency; null for a side nobody knows. */
  expected: { quantity: number | null; unitPrice: OriginalPrice | null };
  /** The Cost Center that bears the expense (`R-51`); null for an invoice of a subscription. */
  chargedCostCenterId: string | null;
  /** The commitment of the year of the service month this invoice goes into, and what is left of it; null when it goes nowhere into a commitment. */
  commitment: { id: string; remainingMinor: bigint } | null;
  /**
   * Set when the invoice is of a `K1` the IT Admin bought and whose grant then failed: it goes to the line of the Cost Center not allocated with the
   * department of the user, bears no Cost Center and takes no commitment down (`QĐ-104k`(4), `US-12-17` AC-11). Null for any other invoice.
   */
  unallocated: { reason: 'K1_GRANT_FAILED'; departmentId: string } | null;
  flags: PurchaseInvoiceFlag[];
}

/** Whose periods without an invoice are read: Finance reads every one, an IT Admin the periods of the departments they work (`D8`). */
export type MissingInvoiceScope = { kind: 'ALL' } | { kind: 'DEPARTMENTS'; departmentIds: readonly string[] };

/** A period of a right paid by the month or the year whose invoice has not come past its due day (`PI-2`, `QĐ-111x`). */
export interface MissingInvoicePeriod {
  link: { kind: 'REQUEST'; requestId: string } | { kind: 'SUBSCRIPTION'; subscriptionId: string };
  planId: string;
  /** The department of the request or the one that owns the subscription; null for a subscription of the shared pool. */
  departmentId: string | null;
  label: PurchaseInvoiceLabel;
  periodIndex: number | null;
  periodCount: number | null;
  /** The first day of the month the period begins to pay for. */
  serviceMonth: BusinessDate;
  paymentDate: BusinessDate;
  /** The last day the invoice was on time; the period carries the mark from the day after. */
  dueDate: BusinessDate;
}
