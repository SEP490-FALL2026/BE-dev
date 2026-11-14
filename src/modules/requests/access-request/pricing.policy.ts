import type { BillingCycleCode, MissingPriceReason, PricingRecord } from './access-request.types';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { MAX_AMOUNT_MINOR, type Money } from '../../../core/money/money';
import { monthsBeginningIn } from '../../../core/term-limit';

/**
 * What a request for paid software costs, as a pure calculation (`FR-3.2`, `BR-MF1-06`, `QĐ-109e`, `QĐ-111j`): the price of a month of
 * the plan times the months of the term that begin in the calendar year the request is checked in (a month counts whole as soon as it
 * begins, R-39), for every person it is for; the months that begin in the year after are the part of next year, kept at the approval
 * (`QĐ-111k`). There is no schedule of payments: one amount for one year. The price comes from the main subscription of the plan in the
 * catalog, never from a person's hand. When there is no price nothing is guessed: the request is _missing its price_ and cannot be sent
 * on to be decided as spend (`QĐ-84e`).
 */

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
  /** The last day of the right; null when it has no end (_Dùng lâu dài_): the part of next year is then twelve months (R-46). */
  endDate: BusinessDate | null;
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
      budgetYear: number;
      /** The cost of the months that begin in the year after the check date (`QĐ-111k`, `QĐ-109b`); null when none does. */
      nextYearAmount: Money | null;
    }
  | { status: 'MISSING'; reason: MissingPriceReason; budgetYear: number };

/** Whole minor units, rounded up once (`R-B01`): the part of a price that is a fraction of a cent is paid in full. */
const ceilDiv = (numerator: bigint, denominator: bigint): bigint => (numerator + denominator - 1n) / denominator;

/**
 * What one seat of a commitment costs a month, rounded up (`R-B01`): the cost of the year held over its months and its seats, kept on the
 * commitment for the release by day (`RV-07`, `M-10`). Null for a price that is not by the month (a one-time price) or a cost of nothing.
 */
export function seatMonthlyOf(input: {
  costMinor: bigint;
  kind: 'RECURRING' | 'ONE_TIME' | null;
  months: number | null;
  seats: number;
}): bigint | null {
  if (input.kind !== 'RECURRING' || input.months === null || input.months <= 0 || input.seats <= 0) return null;
  if (input.costMinor <= 0n) return null;

  return ceilDiv(input.costMinor, BigInt(input.months) * BigInt(input.seats));
}

/** What one person costs a month, rounded up, for showing only: the price of a recurring plan over the months of its billing cycle. */
export function monthlyPriceOf(price: { unitPrice: Money; billingCycle: BillingCycleCode | null }): Money | null {
  if (price.billingCycle === null || price.billingCycle === 'OTHER') return null;

  return {
    amountMinor: ceilDiv(price.unitPrice.amountMinor, BigInt(CYCLE_MONTHS[price.billingCycle])),
    currency: price.unitPrice.currency,
  };
}

/**
 * What one person costs a year at the vendor, whatever month the right begins in: the price of a year of a recurring plan, or the price
 * of the purchase for a one-time one (`P2-02`). Shown beside the amount of the months left, so the sender sees both.
 */
export function annualVendorAmountOf(price: {
  kind: 'RECURRING' | 'ONE_TIME';
  unitPrice: Money;
  billingCycle: BillingCycleCode | null;
}): Money | null {
  if (price.kind === 'ONE_TIME') return price.unitPrice;
  if (price.billingCycle === null || price.billingCycle === 'OTHER') return null;

  return {
    amountMinor: ceilDiv(price.unitPrice.amountMinor * 12n, BigInt(CYCLE_MONTHS[price.billingCycle])),
    currency: price.unitPrice.currency,
  };
}

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
      nextYearAmountMinor: null,
    });
  }

  if (input.billingCycle === null) return { status: 'MISSING', reason: 'NO_PRICED_SUBSCRIPTION', budgetYear: year };
  if (input.billingCycle === 'OTHER') return { status: 'MISSING', reason: 'CYCLE_UNKNOWN', budgetYear: year };

  return recurringAmountOf({ ...input, unitPrice }, input.billingCycle, priced);
}

/** The months that begin in the year of the check date and in the year after, priced by the month of the plan (`QĐ-111j`, `QĐ-111k`, R-46). */
function recurringAmountOf(
  input: PricingInput & { unitPrice: Money },
  billingCycle: Exclude<BillingCycleCode, 'OTHER'>,
  priced: (facts: {
    amountMinor: bigint;
    cycle: BillingCycleCode;
    months: number | null;
    nextYearAmountMinor: bigint | null;
  }) => Pricing,
): Pricing {
  const year = fiscalYearOf(input.checkDate);
  const cycleMonths = BigInt(CYCLE_MONTHS[billingCycle]);
  const costOf = (months: number): bigint =>
    ceilDiv(input.unitPrice.amountMinor * BigInt(months) * BigInt(input.beneficiaries), cycleMonths);
  const start = input.from !== undefined && input.from > input.checkDate ? input.from : input.checkDate;
  const startYear = fiscalYearOf(start);
  // A right with no end holds twelve months of the year after, whatever day it begins (R-46); one with an end, the months that begin then.
  const monthsOf = (inYear: number): number =>
    input.endDate === null && inYear > startYear ? 12 : monthsBeginningIn({ start, end: input.endDate, year: inYear });

  // A right that begins in a year after the check date costs nothing in this one; its first year is shown, never held (`QĐ-109b`).
  if (startYear > year) {
    return priced({
      amountMinor: 0n,
      cycle: billingCycle,
      months: 0,
      nextYearAmountMinor: costOf(Math.max(1, monthsBeginningIn({ start, end: input.endDate, year: startYear }))),
    });
  }

  const months = Math.max(1, monthsOf(year));
  const nextMonths = monthsOf(year + 1);

  return priced({
    amountMinor: costOf(months),
    cycle: billingCycle,
    months,
    nextYearAmountMinor: nextMonths > 0 ? costOf(nextMonths) : null,
  });
}

export interface RequestPriceInput extends Pick<PricingInput, 'beneficiaries' | 'checkDate' | 'endDate' | 'from'> {
  planId: string;
  free: boolean;
  /**
   * The last day of the right of each person it is for, when they do not all end on the same day: a person with a term is cut at the end of
   * the contract, the others are not (R-38). Seats that end on the same day cost the same, so each end is counted once. When given,
   * `beneficiaries` and `endDate` are not read.
   */
  endsByPerson?: readonly (BusinessDate | null)[];
  /**
   * The ends were worked out from the months of use asked, as of `checkDate` (`QĐ-111i`): none of them is a day the request carries, and the
   * seat takes its end from the day it is granted.
   */
  endIsDerived?: boolean;
}

export interface RequestPlanPrice {
  kind: 'RECURRING' | 'ONE_TIME';
  unitPrice: Money;
  billingCycle: BillingCycleCode;
}

/** What a request for internal software costs: nothing, and no day the money goes out. */
const NOT_APPLICABLE_PRICING: PricingRecord = {
  status: 'NOT_APPLICABLE',
  missingReason: null,
  kind: null,
  expectedEndDate: null,
  amountMonths: null,
  budgetYear: null,
  amount: null,
  unitPrice: null,
  billingCycle: null,
  nextYearAmount: null,
};

/** What a request for people whose rights end on different days costs: each end is priced once for the people that share it, and the parts are added. */
function requestAmountsOf(input: RequestPriceInput, price: RequestPlanPrice): Pricing {
  const ends = input.endsByPerson ?? Array.from({ length: input.beneficiaries }, () => input.endDate);
  if (ends.length === 0) return requestAmountOf({ ...price, ...input, beneficiaries: 0 });
  const byEnd = new Map<BusinessDate | null, number>();
  for (const end of ends) byEnd.set(end, (byEnd.get(end) ?? 0) + 1);
  const parts = [...byEnd].map(([endDate, beneficiaries]) =>
    requestAmountOf({
      kind: price.kind,
      unitPrice: price.unitPrice,
      billingCycle: price.billingCycle,
      beneficiaries,
      checkDate: input.checkDate,
      from: input.from,
      endDate,
    }),
  );
  const [first] = parts;
  if (parts.length === 1) return first;
  const missing = parts.find((part) => part.status === 'MISSING');
  if (missing) return missing;
  const priced = parts.filter((part): part is Extract<Pricing, { status: 'PRICED' }> => part.status === 'PRICED');
  const sum = (pick: (part: (typeof priced)[number]) => bigint | null): bigint | null =>
    priced.reduce<bigint | null>((total, part) => {
      const value = pick(part);

      return value === null ? total : (total ?? 0n) + value;
    }, null);
  const amountMinor = sum((part) => part.amount.amountMinor) ?? 0n;
  const nextYearMinor = sum((part) => part.nextYearAmount?.amountMinor ?? null);
  const base = priced[0];
  if (amountMinor > MAX_AMOUNT_MINOR)
    return { status: 'MISSING', reason: 'AMOUNT_TOO_LARGE', budgetYear: base.budgetYear };

  return {
    ...base,
    amount: { amountMinor, currency: base.amount.currency },
    // The seat of a commitment is held over the months of the longest term: the people of a group share one commitment.
    months: base.months === null ? null : Math.max(...priced.map((part) => part.months ?? 0)),
    nextYearAmount: nextYearMinor === null ? null : { amountMinor: nextYearMinor, currency: base.amount.currency },
  };
}

/** The same stored pricing record for intake and worker repricing, from the same plan-price facts. */
export function pricingRecordFor(input: RequestPriceInput, price: RequestPlanPrice | null): PricingRecord {
  const recordedEnd = input.endIsDerived === true || input.endsByPerson !== undefined ? null : input.endDate;
  if (input.free) return { ...NOT_APPLICABLE_PRICING, expectedEndDate: recordedEnd };
  const kind = price?.kind ?? 'RECURRING';
  const priced: Pricing = price
    ? requestAmountsOf(input, { ...price, kind })
    : { status: 'MISSING', reason: 'NO_PRICED_SUBSCRIPTION', budgetYear: fiscalYearOf(input.checkDate) };
  if (priced.status === 'MISSING') {
    return {
      status: 'MISSING',
      missingReason: priced.reason,
      kind: price?.kind ?? null,
      budgetYear: priced.budgetYear,
      expectedEndDate: recordedEnd,
      amountMonths: null,
      amount: null,
      unitPrice: null,
      billingCycle: null,
      nextYearAmount: null,
    };
  }

  return {
    status: 'PRICED',
    missingReason: null,
    kind,
    budgetYear: priced.budgetYear,
    expectedEndDate: recordedEnd,
    amountMonths: priced.months,
    amount: priced.amount,
    unitPrice: priced.unitPrice,
    billingCycle: priced.billingCycle,
    nextYearAmount: priced.nextYearAmount,
  };
}
