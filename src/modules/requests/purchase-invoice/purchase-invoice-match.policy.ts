/**
 * Whether what a purchase invoice says is what was approved or bought (`R-44`), as one pure rule. The count of seats or keys and the price of one,
 * in the currency the invoice states it, are compared; the VND the card took is not, so a difference that comes from the exchange rate or the fee
 * of the card goes straight into the expense and opens no case. A side nobody knows (a subscription with no original price, a request with no
 * count) is not judged.
 */

export interface OriginalPrice {
  amountMinor: bigint;
  currency: string;
}

export interface PurchaseInvoiceMatchInput {
  /** The seats or keys on the invoice. */
  quantity: number;
  /** The price of one on the invoice, in the currency it states. */
  unitPriceOriginal: OriginalPrice;
  /** The seats of the request, or what the subscription bought; null when it is not known. */
  expectedQuantity: number | null;
  /** The price of one in the original currency of the subscription (for a plan in VND, the VND price); null when it is not known. */
  expectedUnitPrice: OriginalPrice | null;
}

export type PurchaseInvoiceMismatch = 'QUANTITY' | 'UNIT_PRICE';

export interface PurchaseInvoiceMatch {
  result: 'MATCHED' | 'PRICE_QUANTITY_EXCEPTION';
  /** What differs, in a fixed order; empty when it matches. */
  reasons: PurchaseInvoiceMismatch[];
}

export function matchPurchaseInvoice(input: PurchaseInvoiceMatchInput): PurchaseInvoiceMatch {
  const reasons: PurchaseInvoiceMismatch[] = [];
  if (input.expectedQuantity !== null && input.quantity !== input.expectedQuantity) reasons.push('QUANTITY');
  const expected = input.expectedUnitPrice;
  if (
    expected !== null &&
    (input.unitPriceOriginal.amountMinor !== expected.amountMinor ||
      input.unitPriceOriginal.currency !== expected.currency)
  ) {
    reasons.push('UNIT_PRICE');
  }

  return { result: reasons.length === 0 ? 'MATCHED' : 'PRICE_QUANTITY_EXCEPTION', reasons };
}

/** The columns of a purchase invoice that was kept which the match reads: what it says, and what it was read against (null for a side nobody knew). */
export interface KeptPurchaseInvoiceFigures {
  quantity: number;
  unitPriceOriginalMinor: bigint;
  unitPriceOriginalCurrency: string;
  expectedQuantity: number | null;
  expectedUnitPriceOriginalMinor: bigint | null;
  expectedUnitPriceOriginalCurrency: string | null;
}

/** What differs on an invoice already kept, judged by the same rule as when it was submitted, so the case of an invoice that differs names it. */
export function mismatchesOfRow(row: KeptPurchaseInvoiceFigures): PurchaseInvoiceMismatch[] {
  return matchPurchaseInvoice({
    quantity: row.quantity,
    unitPriceOriginal: { amountMinor: row.unitPriceOriginalMinor, currency: row.unitPriceOriginalCurrency },
    expectedQuantity: row.expectedQuantity,
    expectedUnitPrice:
      row.expectedUnitPriceOriginalMinor !== null && row.expectedUnitPriceOriginalCurrency !== null
        ? { amountMinor: row.expectedUnitPriceOriginalMinor, currency: row.expectedUnitPriceOriginalCurrency }
        : null,
  }).reasons;
}

/**
 * What the invoice of a subscription, or of the shared pool, may cost before it is marked over (`QĐ-103w`(3), `QĐ-104c`(3), `QĐ-104d`): the seats
 * bought times the price of a month times the months to the renewal day, and for the invoice of a renewal (it pays for the month of the renewal day
 * or after, or no renewal day is known) the seats of the period times the price of the cycle. Null when a side is not known, as for `R-44`: what
 * nobody knows is not judged.
 */
export function pooledInvoiceCeilingMinor(input: {
  quantity: number | null;
  monthlyMinor: bigint | null;
  cycleMonths: number | null;
  /** The first day of the month the invoice pays for. */
  serviceMonth: string;
  renewalDate: string | null;
}): bigint | null {
  if (input.quantity === null || input.monthlyMinor === null) return null;
  const monthsOf = (day: string): number => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));
  const ahead = input.renewalDate === null ? 0 : monthsOf(input.renewalDate) - monthsOf(input.serviceMonth);
  const months = ahead > 0 ? ahead : input.cycleMonths;
  if (months === null) return null;

  return BigInt(input.quantity) * input.monthlyMinor * BigInt(months);
}
