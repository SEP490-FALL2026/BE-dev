import { addDays, type BusinessDate } from '../../../core/business-date';
import { addMonths, fiscalYearOf } from '../../../core/fiscal-year';
import { MAX_AMOUNT_MINOR, type Money } from '../../../core/money/money';

/**
 * What a request for paid software costs, as a pure calculation (`FR-3.2`, `BR-MF1-06`, `QĐ-109e`): the unit price of the
 * plan, for the months that are left of the calendar year the request is checked in (the month it starts is counted whole), for
 * every person it is for. There is no schedule of payments: one amount for one year. The price comes from the main subscription of
 * the plan in the catalog, never from a person's hand. When there is no price nothing is guessed: the request is _missing
 * its price_ and cannot be sent on to be decided as spend (`QĐ-84e`).
 */

export type BillingCycleCode = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';

const CYCLE_MONTHS: Readonly<Record<Exclude<BillingCycleCode, 'OTHER'>, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

export interface PricingInput {
  /** Pricing model: RECURRING (monthly/yearly) or ONE_TIME (perpetual license or key, `QĐ-106d`). */
  kind: 'RECURRING' | 'ONE_TIME';
  /** The unit price per person per billing period of the plan; null when the plan has no priced subscription. */
  unitPrice: Money | null;
  billingCycle: BillingCycleCode | null;
  beneficiaries: number;
  /**
   * The day the amount is worked out on (`QĐ-109e`): the day of sending for a provisional amount, the month a batch is submitted,
   * the day of an approval. The calendar year of this day is the year the request is counted in.
   */
  checkDate: BusinessDate;
  /**
   * The day the right begins when it is not the check date: the start of the new period of a request to go on using (`QĐ-109b`). A
   * start in a year after the check date counts as no month in this year.
   */
  from?: BusinessDate;
  /** The day the right ends; null when it has no end, so the amount runs to the end of the year. */
  endDate: BusinessDate | null;
}

export type MissingPriceReason = 'NO_PRICED_SUBSCRIPTION' | 'CYCLE_UNKNOWN' | 'AMOUNT_TOO_LARGE' | 'AWAITING_QUOTE';

/** One payment of the cost of a request; a request has one, for the year it is counted in. */
export interface PaymentPeriod {
  dueOn: BusinessDate;
  amountMinor: bigint;
  /** The calendar year the amount falls in. */
  budgetYear: number;
  /** Whether the amount binds the company; every amount worked out from the catalog does. */
  binding: boolean;
}

export type Pricing =
  | {
      status: 'PRICED';
      amount: Money;
      unitPrice: Money;
      billingCycle: BillingCycleCode;
      kind: 'RECURRING' | 'ONE_TIME';
      /** The months of the year the amount covers; null for a one-time price. 0 for a start in a year after the check date. */
      months: number | null;
      /** One payment, so the budget check and the commitment read the same shape as before. */
      periods: PaymentPeriod[];
      budgetYear: number;
      /** The cost of the part that falls in the year after the check date, for a request that starts then (`QĐ-109b`); null otherwise. */
      nextYearAmount: Money | null;
    }
  | { status: 'MISSING'; reason: MissingPriceReason; budgetYear: number };

/** The calendar months from the month of `start` to the month of `end`, both counted whole; a day before the start still counts as one month. */
export function monthsBetween(start: BusinessDate, end: BusinessDate): number {
  const monthIndex = (day: BusinessDate): number => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));

  return Math.max(1, monthIndex(end) - monthIndex(start) + 1);
}

/** Whole minor units, rounded up once (`R-B01`): the part of a price that is a fraction of a cent is paid in full. */
const ceilDiv = (numerator: bigint, denominator: bigint): bigint => (numerator + denominator - 1n) / denominator;

/** The last day an amount of a request counts: the end of its right, never past the end of the year. */
function lastDayCounted(year: number, endDate: BusinessDate | null): BusinessDate {
  const yearEnd: BusinessDate = `${year}-12-31`;

  return endDate !== null && endDate < yearEnd ? endDate : yearEnd;
}

/** The latest day a right asked for may end: a year from `today`, the day before the same day twelve months later (`QĐ-104a`, `US-05-23` AC-9). */
export const maxEndDateOf = (today: BusinessDate): BusinessDate => addDays(addMonths(today, 12), -1);

export function requestAmountOf(input: PricingInput): Pricing {
  const year = fiscalYearOf(input.checkDate);
  // A price of nothing is no price: a paid request never costs 0 (`FR-3.2`), so the price data is incomplete and the request is not
  // checked, instead of reaching an approval that cannot hold a commitment of 0.
  if (input.unitPrice === null || input.unitPrice.amountMinor <= 0n) {
    return { status: 'MISSING', reason: 'NO_PRICED_SUBSCRIPTION', budgetYear: year };
  }
  const { unitPrice } = input;
  const people = BigInt(input.beneficiaries);
  const priced = (facts: {
    amountMinor: bigint;
    cycle: BillingCycleCode;
    months: number | null;
    start: BusinessDate;
    nextYearAmountMinor: bigint | null;
  }): Pricing => {
    if (facts.amountMinor > MAX_AMOUNT_MINOR)
      return { status: 'MISSING', reason: 'AMOUNT_TOO_LARGE', budgetYear: year };

    return {
      status: 'PRICED',
      amount: { amountMinor: facts.amountMinor, currency: unitPrice.currency },
      unitPrice,
      billingCycle: facts.cycle,
      kind: input.kind,
      months: facts.months,
      periods: [{ dueOn: facts.start, amountMinor: facts.amountMinor, budgetYear: year, binding: true }],
      budgetYear: year,
      nextYearAmount:
        facts.nextYearAmountMinor === null
          ? null
          : { amountMinor: facts.nextYearAmountMinor, currency: unitPrice.currency },
    };
  };

  // A one-time price (a key, a perpetual license) is the price of the purchase, whatever the term (`QĐ-106d`, `BR-MF1-07`).
  if (input.kind === 'ONE_TIME') {
    return priced({
      amountMinor: unitPrice.amountMinor * people,
      cycle: 'OTHER',
      months: null,
      start: input.checkDate,
      nextYearAmountMinor: null,
    });
  }

  if (input.billingCycle === null) return { status: 'MISSING', reason: 'NO_PRICED_SUBSCRIPTION', budgetYear: year };
  if (input.billingCycle === 'OTHER') return { status: 'MISSING', reason: 'CYCLE_UNKNOWN', budgetYear: year };

  const cycleMonths = BigInt(CYCLE_MONTHS[input.billingCycle]);
  const costOf = (months: number): bigint => ceilDiv(unitPrice.amountMinor * BigInt(months) * people, cycleMonths);
  const start = input.from !== undefined && input.from > input.checkDate ? input.from : input.checkDate;
  const startYear = fiscalYearOf(start);

  // A right that begins in a year after the check date costs nothing in this one; its first year is shown, never held (`QĐ-109b`).
  if (startYear > year) {
    const nextMonths = monthsBetween(start, lastDayCounted(startYear, input.endDate));

    return priced({
      amountMinor: 0n,
      cycle: input.billingCycle,
      months: 0,
      start,
      nextYearAmountMinor: costOf(nextMonths),
    });
  }

  const months = monthsBetween(start, lastDayCounted(year, input.endDate));

  return priced({
    amountMinor: costOf(months),
    cycle: input.billingCycle,
    months,
    start,
    nextYearAmountMinor: null,
  });
}
