import type { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import type { PricingRecord } from './access-request.types';
import type { MissingPriceReason } from './pricing.policy';

/** The columns of a request that carry its price, as the database returns them. */
type PricingRow = Pick<
  Prisma.AccessRequestGetPayload<object>,
  | 'pricingStatus'
  | 'priceMissingReason'
  | 'expectedSpendOn'
  | 'budgetYear'
  | 'amountMinor'
  | 'amountCurrency'
  | 'unitPriceMinor'
  | 'billingCycle'
  | 'paymentSchedule'
>;

interface ScheduleJson {
  dueOn: string;
  amountMinor: string;
  budgetYear: number;
  /** Absent in a schedule written before quotes existed: every payment of it binds. */
  binding?: boolean;
}

export function toPricing(row: PricingRow): PricingRecord {
  const currency = row.amountCurrency;

  return {
    status: row.pricingStatus,
    missingReason: row.priceMissingReason as MissingPriceReason | null,
    expectedSpendOn: row.expectedSpendOn ? fromDateColumn(row.expectedSpendOn) : null,
    budgetYear: row.budgetYear,
    amount: row.amountMinor !== null && currency !== null ? { amountMinor: row.amountMinor, currency } : null,
    unitPrice: row.unitPriceMinor !== null && currency !== null ? { amountMinor: row.unitPriceMinor, currency } : null,
    billingCycle: row.billingCycle,
    schedule: Array.isArray(row.paymentSchedule)
      ? (row.paymentSchedule as unknown as ScheduleJson[]).map((period) => ({
          dueOn: period.dueOn,
          amountMinor: BigInt(period.amountMinor),
          budgetYear: period.budgetYear,
          binding: period.binding ?? true,
        }))
      : null,
  };
}

/** The columns of a price; the schedule is kept as JSON with the amounts as text, since JSON has no big integers. */
export function pricingColumns(pricing: PricingRecord) {
  return {
    pricingStatus: pricing.status,
    priceMissingReason: pricing.missingReason,
    expectedSpendOn: pricing.expectedSpendOn ? toDateColumn(pricing.expectedSpendOn) : null,
    budgetYear: pricing.budgetYear,
    amountMinor: pricing.amount?.amountMinor ?? null,
    amountCurrency: pricing.amount?.currency ?? null,
    unitPriceMinor: pricing.unitPrice?.amountMinor ?? null,
    billingCycle: pricing.billingCycle,
    paymentSchedule: pricing.schedule
      ? (pricing.schedule.map((period) => ({
          dueOn: period.dueOn,
          amountMinor: period.amountMinor.toString(),
          budgetYear: period.budgetYear,
          binding: period.binding,
        })) as unknown as Prisma.InputJsonArray)
      : undefined,
  };
}
