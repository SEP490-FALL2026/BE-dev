import type { BusinessDate } from '../../../../core/business-date';

/**
 * What a purchase invoice is called and which period of the right it pays for (`QĐ-111w`, `R-50`), as pure rules. The label follows the invoices
 * of the request (the first one is the purchase, the others are periods); the period follows the month the invoice pays for, counted from the
 * month the right began. A month outside the term is a mark on the invoice, never a refusal (SPEC PI-1).
 */

export type PurchaseInvoiceLabel = 'NEW_PURCHASE' | 'PERIOD' | 'RENEWAL';

/** Marks that are laid on an invoice and never refuse it. */
export type PurchaseInvoiceFlag = 'OVER_APPROVED' | 'OUTSIDE_TERM' | 'NO_EXPECTED_AMOUNT';

export interface PurchaseInvoiceLabelInput {
  link: 'REQUEST' | 'SUBSCRIPTION';
  /** The request is one that goes on using a right that ended (`QĐ-111l`); its invoices are renewals. */
  continuation: boolean;
  /** An invoice of this request exists that was not returned. */
  hasEarlierInvoice: boolean;
  /** The first day of the month the invoice pays for. */
  serviceMonth: BusinessDate;
  /** The first day of the month the right began (the grant); null for a subscription. */
  startMonth: BusinessDate | null;
  /** The months of the right; null for a right with no end ("Dùng lâu dài"). */
  termMonths: number | null;
}

export interface PurchaseInvoiceLabelResult {
  label: PurchaseInvoiceLabel;
  /** 1 for the month the right began; null for a renewal and for a month before the right began. */
  periodIndex: number | null;
  /** The months of the term; null for a right with no end and for a renewal. */
  periodCount: number | null;
  /** The month is before the right began or after the end of its term. */
  outsideTerm: boolean;
}

/** The first day of the month of a day. */
export function firstOfMonth(date: BusinessDate): BusinessDate {
  return `${date.slice(0, 7)}-01`;
}

/** The year an invoice is spent in: the year of the month it pays for, whatever day it is dated (`R-51`, T-PI 02/01/2027 for 12/2026). */
export function expenseYearOf(serviceMonth: BusinessDate): number {
  return Number(serviceMonth.slice(0, 4));
}

/** The whole months from one first-of-month to another; negative when the second is earlier. */
export function monthsBetween(from: BusinessDate, to: BusinessDate): number {
  const index = (date: BusinessDate) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));

  return index(to) - index(from);
}

export function labelOfPurchaseInvoice(input: PurchaseInvoiceLabelInput): PurchaseInvoiceLabelResult {
  if (input.link === 'SUBSCRIPTION' || input.continuation || input.startMonth === null) {
    return { label: 'RENEWAL', periodIndex: null, periodCount: null, outsideTerm: false };
  }
  const index = monthsBetween(input.startMonth, input.serviceMonth) + 1;
  const label: PurchaseInvoiceLabel = input.hasEarlierInvoice ? 'PERIOD' : 'NEW_PURCHASE';
  const before = index < 1;
  const after = input.termMonths !== null && index > input.termMonths;

  return {
    label,
    periodIndex: before ? null : index,
    periodCount: input.termMonths,
    outsideTerm: before || after,
  };
}

/** The marks of an invoice, in a fixed order. */
export function flagsOfPurchaseInvoice(input: {
  outsideTerm: boolean;
  overApproved: boolean;
  noExpectedAmount?: boolean;
}): PurchaseInvoiceFlag[] {
  const flags: PurchaseInvoiceFlag[] = [];
  if (input.overApproved) flags.push('OVER_APPROVED');
  if (input.outsideTerm) flags.push('OUTSIDE_TERM');
  if (input.noExpectedAmount) flags.push('NO_EXPECTED_AMOUNT');

  return flags;
}
