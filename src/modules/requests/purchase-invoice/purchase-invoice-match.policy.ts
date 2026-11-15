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
