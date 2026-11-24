import type { BillingCycleCode, MissingPriceReason, PricingRecord } from './access-request.types';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { MAX_AMOUNT_MINOR, type Money } from '../../../core/money/money';
import { calendarMonthsIn, monthsBeginningIn } from '../../../core/term-limit';

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
  /** Plan provisioning type (`K2` counts calendar months; `K1` and others keep rolling months). */
  provisioningType?: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** The unit price per person per billing period of the plan; null when the plan has no priced subscription. */
  unitPrice: Money | null;
  /** Monthly price per seat in dong from `monthly_unit_price_minor` (or plan reference); avoids re-dividing `unitPrice`. */
  monthlyPriceMinor?: bigint | null;
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
      monthlyPriceMinor?: bigint | null;
      billingCycle: BillingCycleCode;
      kind: 'RECURRING' | 'ONE_TIME';
      /** The months of the year the amount covers; null for a one-time price. 0 for a start in a year after the check date. */
      months: number | null;
      budgetYear: number;
      /** The cost of the months that begin in the year after the check date (`QĐ-111k`, `QĐ-109b`); null when none does. */
      nextYearAmount: Money | null;
    }
  | { status: 'MISSING'; reason: MissingPriceReason; budgetYear: number };

/** Whole minor units, rounded up once (`R-B01`) for legacy callers without `monthlyPriceMinor` (quotes and line allocation). */
const ceilDiv = (numerator: bigint, denominator: bigint): bigint => (numerator + denominator - 1n) / denominator;

function legacySeatMonthlyOf(unitPrice?: Money | null, billingCycle?: BillingCycleCode | null): bigint | null {
  if (!unitPrice || !billingCycle || billingCycle === 'OTHER') return null;

  return monthlyPriceOf({ unitPrice, billingCycle })?.amountMinor ?? null;
}

/**
 * What one seat of a commitment costs a month (`RV-07`, `M-10`): reads `monthlyPriceMinor` directly when provided (no reverse
 * division of cost over months × seats), falling back to the stored monthly price of `unitPrice`/`billingCycle` only when absent.
 */
export function seatMonthlyOf(input: {
  monthlyPriceMinor?: bigint | null;
  unitPrice?: Money | null;
  billingCycle?: BillingCycleCode | null;
  costMinor: bigint;
  kind: 'RECURRING' | 'ONE_TIME' | null;
  months: number | null;
  seats: number;
}): bigint | null {
  if (input.kind !== 'RECURRING' || input.months === null || input.months <= 0 || input.seats <= 0) return null;
  if (input.costMinor <= 0n) return null;
  const monthly =
    input.monthlyPriceMinor !== undefined
      ? input.monthlyPriceMinor
      : legacySeatMonthlyOf(input.unitPrice, input.billingCycle);

  return monthly !== null && monthly > 0n ? monthly : null;
}

/** What one person costs a month, reading `monthlyPriceMinor` directly when provided. */
export function monthlyPriceOf(price: {
  monthlyPriceMinor?: bigint | null;
  unitPrice: Money;
  billingCycle: BillingCycleCode | null;
}): Money | null {
  if (price.monthlyPriceMinor !== undefined) {
    return price.monthlyPriceMinor === null
      ? null
      : { amountMinor: price.monthlyPriceMinor, currency: price.unitPrice.currency };
  }
  if (price.billingCycle === null || price.billingCycle === 'OTHER') return null;

  return {
    amountMinor: ceilDiv(price.unitPrice.amountMinor, BigInt(CYCLE_MONTHS[price.billingCycle])),
    currency: price.unitPrice.currency,
  };
}

function isAnnualFirstPurchaseCommitment(price: {
  billingCycle: BillingCycleCode | null;
  provisioningType?: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  referenceCommitmentMonths?: 1 | 12 | null;
}): boolean {
  if (price.provisioningType === 'K2') return (price.referenceCommitmentMonths ?? 12) === 12;
  if (price.provisioningType !== undefined) return price.referenceCommitmentMonths === 12;

  return price.billingCycle === 'ANNUAL';
}

/**
 * What one person costs a year at the vendor, whatever month the right begins in: twelve months of the monthly price of a recurring plan,
 * or the price of the purchase for a one-time one (`P2-02`). When `firstPurchaseOnly` is true (`BR-MF1-07b`), a K2 plan returns the annual
 * amount when its commitment (`referenceCommitmentMonths`, null read as 12) is 12 months.
 */
export function annualVendorAmountOf(price: {
  kind: 'RECURRING' | 'ONE_TIME';
  unitPrice: Money;
  monthlyPriceMinor?: bigint | null;
  billingCycle: BillingCycleCode | null;
  provisioningType?: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  referenceCommitmentMonths?: 1 | 12 | null;
  firstPurchaseOnly?: boolean;
}): Money | null {
  if (price.kind === 'ONE_TIME') return price.firstPurchaseOnly ? null : price.unitPrice;
  if (price.firstPurchaseOnly && !isAnnualFirstPurchaseCommitment(price)) return null;
  const monthly = monthlyPriceOf(price);
  if (monthly === null) return null;

  return { amountMinor: monthly.amountMinor * 12n, currency: monthly.currency };
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
      ...(input.monthlyPriceMinor !== undefined ? { monthlyPriceMinor: input.monthlyPriceMinor } : {}),
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
  if (input.monthlyPriceMinor !== undefined && (input.monthlyPriceMinor === null || input.monthlyPriceMinor <= 0n)) {
    return { status: 'MISSING', reason: 'NO_PRICED_SUBSCRIPTION', budgetYear: year };
  }

  return recurringAmountOf({ ...input, unitPrice }, input.billingCycle, priced);
}

/**
 * The months of the check year and next year (`calendarMonthsIn` for `K2`, `monthsBeginningIn` for `K1`/others), priced directly by
 * `monthlyPriceMinor` when provided (`QĐ-111j`, `QĐ-111k`, `QĐ-104k`(1), `QĐ-116an`, R-46).
 */
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
  const monthlyMinor = input.monthlyPriceMinor;
  const costOf = (months: number): bigint =>
    monthlyMinor !== undefined && monthlyMinor !== null
      ? monthlyMinor * BigInt(months) * BigInt(input.beneficiaries)
      : ceilDiv(input.unitPrice.amountMinor * BigInt(months) * BigInt(input.beneficiaries), cycleMonths);
  const start = input.from !== undefined && input.from > input.checkDate ? input.from : input.checkDate;
  const startYear = fiscalYearOf(start);
  const countMonths = (inYear: number): number =>
    input.provisioningType === 'K2'
      ? calendarMonthsIn({ start, lastHeldOn: input.endDate, year: inYear })
      : monthsBeginningIn({ start, end: input.endDate, year: inYear });
  // A right with no end holds twelve months of the year after, whatever day it begins (R-46); one with an end, the months in that year.
  const monthsOf = (inYear: number): number =>
    input.endDate === null && inYear > startYear ? 12 : countMonths(inYear);

  // A right that begins in a year after the check date costs nothing in this one; its first year is shown, never held (`QĐ-109b`).
  if (startYear > year) {
    return priced({
      amountMinor: 0n,
      cycle: billingCycle,
      months: 0,
      nextYearAmountMinor: costOf(Math.max(1, countMonths(startYear))),
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
  provisioningType?: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
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
  provisioningType?: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  unitPrice: Money;
  monthlyPriceMinor?: bigint | null;
  billingCycle: BillingCycleCode;
  /** Where the price comes from (`QĐ-113a`); a price that does not say is taken to come from no subscription or reference. */
  source?: 'SUBSCRIPTION' | 'PLAN_REFERENCE';
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
      provisioningType: input.provisioningType ?? price.provisioningType,
      unitPrice: price.unitPrice,
      monthlyPriceMinor: price.monthlyPriceMinor,
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

const missingPricingRecord = (
  missingReason: MissingPriceReason,
  kind: 'RECURRING' | 'ONE_TIME' | null,
  budgetYear: number,
  expectedEndDate: BusinessDate | null,
): PricingRecord => ({
  status: 'MISSING',
  missingReason,
  kind,
  budgetYear,
  expectedEndDate,
  amountMonths: null,
  amount: null,
  unitPrice: null,
  billingCycle: null,
  nextYearAmount: null,
});

/** The same stored pricing record for intake and worker repricing, from the same plan-price facts. */
export function pricingRecordFor(input: RequestPriceInput, price: RequestPlanPrice | null): PricingRecord {
  const recordedEnd = input.endIsDerived === true || input.endsByPerson !== undefined ? null : input.endDate;
  if (input.free) return { ...NOT_APPLICABLE_PRICING, expectedEndDate: recordedEnd };
  if (!price) return missingPricingRecord('NO_PRICED_SUBSCRIPTION', null, fiscalYearOf(input.checkDate), recordedEnd);
  const priced = requestAmountsOf(input, { ...price, kind: price.kind });
  if (priced.status === 'MISSING')
    return missingPricingRecord(priced.reason, price.kind, priced.budgetYear, recordedEnd);

  return {
    status: 'PRICED',
    missingReason: null,
    kind: price.kind,
    budgetYear: priced.budgetYear,
    expectedEndDate: recordedEnd,
    amountMonths: priced.months,
    amount: priced.amount,
    unitPrice: priced.unitPrice,
    ...(priced.monthlyPriceMinor !== undefined ? { monthlyPriceMinor: priced.monthlyPriceMinor } : {}),
    billingCycle: priced.billingCycle,
    nextYearAmount: priced.nextYearAmount,
    priceSource: price.source,
  };
}
