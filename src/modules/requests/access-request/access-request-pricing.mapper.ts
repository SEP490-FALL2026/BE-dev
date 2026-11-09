import type { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import type { PricingRecord } from './access-request.types';
import { paymentScheduleJson } from './access-request.json';
import type { MissingPriceReason } from './pricing.policy';

/** The columns of a request that carry its price, as the database returns them. */
type PricingRow = Pick<
  Prisma.AccessRequestGetPayload<object>,
  | 'pricingStatus'
  | 'priceMissingReason'
  | 'priceKind'
  | 'expectedSpendOn'
  | 'expectedEndDate'
  | 'amountMonths'
  | 'budgetYear'
  | 'amountMinor'
  | 'amountCurrency'
  | 'unitPriceMinor'
  | 'billingCycle'
  | 'paymentSchedule'
>;

export function toPricing(row: PricingRow): PricingRecord {
  const currency = row.amountCurrency;

  return {
    status: row.pricingStatus,
    missingReason: row.priceMissingReason as MissingPriceReason | null,
    kind: row.priceKind ?? null,
    expectedSpendOn: row.expectedSpendOn ? fromDateColumn(row.expectedSpendOn) : null,
    expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
    amountMonths: row.amountMonths ?? null,
    budgetYear: row.budgetYear,
    amount: row.amountMinor !== null && currency !== null ? { amountMinor: row.amountMinor, currency } : null,
    unitPrice: row.unitPriceMinor !== null && currency !== null ? { amountMinor: row.unitPriceMinor, currency } : null,
    billingCycle: row.billingCycle,
    schedule: paymentScheduleJson.decode(row.paymentSchedule),
  };
}

/** The columns of a price; the schedule is kept as JSON with the amounts as text, since JSON has no big integers. */
export function pricingColumns(pricing: PricingRecord) {
  return {
    pricingStatus: pricing.status,
    priceMissingReason: pricing.missingReason,
    priceKind: pricing.kind ?? null,
    expectedSpendOn: pricing.expectedSpendOn ? toDateColumn(pricing.expectedSpendOn) : null,
    expectedEndDate: pricing.expectedEndDate ? toDateColumn(pricing.expectedEndDate) : null,
    amountMonths: pricing.amountMonths ?? null,
    budgetYear: pricing.budgetYear,
    amountMinor: pricing.amount?.amountMinor ?? null,
    amountCurrency: pricing.amount?.currency ?? null,
    unitPriceMinor: pricing.unitPrice?.amountMinor ?? null,
    billingCycle: pricing.billingCycle,
    paymentSchedule: pricing.schedule ? paymentScheduleJson.encode(pricing.schedule) : undefined,
  };
}
