import type { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import type { MissingPriceReason, PricingRecord } from './access-request.types';

/** The columns of a request that carry its price, as the database returns them. */
type PricingRow = Pick<
  Prisma.AccessRequestGetPayload<object>,
  | 'pricingStatus'
  | 'priceMissingReason'
  | 'priceKind'
  | 'expectedEndDate'
  | 'amountMonths'
  | 'budgetYear'
  | 'amountMinor'
  | 'amountCurrency'
  | 'unitPriceMinor'
  | 'monthlyPriceMinor'
  | 'billingCycle'
  | 'nextYearAmountMinor'
>;

export function toPricing(row: PricingRow): PricingRecord {
  const currency = row.amountCurrency;

  return {
    status: row.pricingStatus,
    missingReason: row.priceMissingReason as MissingPriceReason | null,
    kind: row.priceKind ?? null,
    expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
    amountMonths: row.amountMonths ?? null,
    budgetYear: row.budgetYear,
    amount: row.amountMinor !== null && currency !== null ? { amountMinor: row.amountMinor, currency } : null,
    unitPrice: row.unitPriceMinor !== null && currency !== null ? { amountMinor: row.unitPriceMinor, currency } : null,
    monthlyPriceMinor: row.priceKind === 'ONE_TIME' ? null : row.monthlyPriceMinor,
    billingCycle: row.billingCycle,
    nextYearAmount:
      row.nextYearAmountMinor !== null && currency !== null ? { amountMinor: row.nextYearAmountMinor, currency } : null,
  };
}

function amountColumns(pricing: PricingRecord) {
  return {
    amountMinor: pricing.amount ? pricing.amount.amountMinor : null,
    amountCurrency: pricing.amount ? pricing.amount.currency : null,
    unitPriceMinor: pricing.unitPrice ? pricing.unitPrice.amountMinor : null,
    monthlyPriceMinor: pricing.monthlyPriceMinor ?? null,
    nextYearAmountMinor: pricing.nextYearAmount ? pricing.nextYearAmount.amountMinor : null,
  };
}

/** The columns of a price. `expected_spend_on` and `payment_schedule` are not written any more (a trigger refuses it); old rows keep theirs. */
export function pricingColumns(pricing: PricingRecord) {
  return {
    pricingStatus: pricing.status,
    priceMissingReason: pricing.missingReason,
    priceKind: pricing.kind ?? null,
    expectedEndDate: pricing.expectedEndDate ? toDateColumn(pricing.expectedEndDate) : null,
    amountMonths: pricing.amountMonths ?? null,
    budgetYear: pricing.budgetYear,
    billingCycle: pricing.billingCycle,
    ...amountColumns(pricing),
  };
}
