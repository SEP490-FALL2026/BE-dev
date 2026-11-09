import { addDays, type BusinessDate } from '../../../core/business-date';
import { MAX_AMOUNT_MINOR, type Money } from '../../../core/money/money';
import { monthlyPriceOf, requestAmountOf, type BillingCycleCode } from '../access-request/pricing.policy';

/**
 * What the commitment made on 01/01 holds (`FR-5.8`(6), `BR-MF1-09`, `QĐ-109a`), as pure decisions. A request whose right goes on into the
 * new year, or that was approved as spend and not yet granted, holds one commitment for that year: the price of a month on 01/01 times
 * the months of the year of every seat it stands for, the month of the end of a right counted whole. Nothing is judged against the
 * budget; the commitment is made, and waits for a budget when the year has none yet. A right that is not a request's (a seat of the
 * baseline, a seat of a role) has no commitment (`QĐ-109a`).
 */

/** The states of a request that can still be running or waiting to be granted on 01/01: the grant was approved as spend and not ended. */
export const YEAR_START_REQUEST_STATES = ['AWAITING_EXECUTION', 'EXECUTING', 'COMPLETED'] as const;

/** The kinds of provisioning that cost the company every month a seat is held; a one-time key (`K4`) or free software never does. */
export const YEAR_START_PLAN_KINDS: readonly string[] = ['K1', 'K2'];

/**
 * When a seat is expected to end: the day the request names, and the day the period of the seat closes (exclusive, `valid_until`); and the
 * department that bears its cost now (the owning department of the record of the seat that runs, null when the record names none or the seat
 * is not granted yet: the department of the request then).
 */
export interface YearStartSeat {
  expectedEndDate: BusinessDate | null;
  validUntil: BusinessDate | null;
  departmentId: string | null;
}

/** What a plan is bought at, as the catalog says it. */
export interface YearStartPrice {
  kind: 'RECURRING' | 'ONE_TIME';
  unitPrice: Money;
  billingCycle: BillingCycleCode | null;
}

export type YearStartSkipReason =
  /** The plan has no usable recurring price: nothing is guessed (`QĐ-84e`). */
  | 'NO_PRICE'
  /** Nothing of the request is left to commit on 01/01: every seat is over, or none was ever made. */
  | 'NO_SEAT'
  /** The department that bears the cost has no Cost Center in use. */
  | 'NO_COST_CENTER'
  /** The amount is more than a money value may hold, in the currency of the price or in the reporting currency. */
  | 'AMOUNT_TOO_LARGE'
  /** The price is in another currency than the reporting one and no rate was entered for 01/01 nor for the day of the pass. */
  | 'NO_RATE'
  /** The approved budget of the year is in another currency than the reporting one: nothing of two currencies is added together. */
  | 'CURRENCY_MISMATCH';

export type YearStartAmount =
  | { status: 'PRICED'; amountMinor: bigint; seatMonthlyMinor: bigint; currency: string }
  | { status: 'SKIPPED'; reason: Extract<YearStartSkipReason, 'NO_PRICE' | 'NO_SEAT' | 'AMOUNT_TOO_LARGE'> };

/** The last day a seat is counted: the earlier of the expected end and the day before its period closes; null when it has no end. */
export function lastDayOfSeat(seat: YearStartSeat): BusinessDate | null {
  const closes = seat.validUntil === null ? null : addDays(seat.validUntil, -1);
  if (seat.expectedEndDate === null) return closes;

  return closes !== null && closes < seat.expectedEndDate ? closes : seat.expectedEndDate;
}

/** Whether the seat still costs something on 01/01 of the year: one that ended on or before 31/12 does not (`BR-MF1-09e`). */
export function seatCountsOn(seat: YearStartSeat, yearStart: BusinessDate): boolean {
  const last = lastDayOfSeat(seat);

  return last === null || last >= yearStart;
}

/**
 * The amount of the commitment of one request: for each seat that counts, the months from January to the month of its last day (twelve with
 * no end in the year), at the monthly price of the plan, added up. It is worked out with the rule of the amount of a request
 * (`requestAmountOf`, the day it is checked on being 01/01), so the two cannot disagree on a month.
 */
export function yearStartAmountOf(input: {
  year: number;
  seats: readonly YearStartSeat[];
  price: YearStartPrice | null;
}): YearStartAmount {
  const yearStart: BusinessDate = `${input.year}-01-01`;
  const counted = input.seats.filter((seat) => seatCountsOn(seat, yearStart));
  if (counted.length === 0) return { status: 'SKIPPED', reason: 'NO_SEAT' };
  const { price } = input;
  if (price === null || price.kind !== 'RECURRING') return { status: 'SKIPPED', reason: 'NO_PRICE' };
  const monthly = monthlyPriceOf({ unitPrice: price.unitPrice, billingCycle: price.billingCycle });
  if (monthly === null || monthly.amountMinor <= 0n) return { status: 'SKIPPED', reason: 'NO_PRICE' };

  // Seats that end on the same day cost the same: one calculation for each end date, not for each seat.
  const seatsByEnd = new Map<string | null, number>();
  for (const seat of counted) {
    const last = lastDayOfSeat(seat);
    seatsByEnd.set(last, (seatsByEnd.get(last) ?? 0) + 1);
  }
  let total = 0n;
  for (const [endDate, beneficiaries] of seatsByEnd) {
    const priced = requestAmountOf({
      kind: 'RECURRING',
      unitPrice: price.unitPrice,
      billingCycle: price.billingCycle,
      beneficiaries,
      checkDate: yearStart,
      endDate,
    });
    if (priced.status === 'MISSING') {
      return { status: 'SKIPPED', reason: priced.reason === 'AMOUNT_TOO_LARGE' ? 'AMOUNT_TOO_LARGE' : 'NO_PRICE' };
    }
    total += priced.amount.amountMinor;
  }
  // Each end date is within the range, the seats of all of them together may not be.
  if (total > MAX_AMOUNT_MINOR) return { status: 'SKIPPED', reason: 'AMOUNT_TOO_LARGE' };

  return {
    status: 'PRICED',
    amountMinor: total,
    seatMonthlyMinor: monthly.amountMinor,
    currency: price.unitPrice.currency,
  };
}

export type YearStartJudgement =
  | { status: 'COMMIT'; amountMinor: bigint; seatMonthlyMinor: bigint; currency: string; costCenterId: string }
  /** Nothing is committed and the system says why in the Audit Trail: the price or the Cost Center is missing, or the amount is too large. */
  | { status: 'LEFT_OUT'; reason: Extract<YearStartSkipReason, 'NO_PRICE' | 'NO_COST_CENTER' | 'AMOUNT_TOO_LARGE'> }
  /** Nothing is left to commit: every seat is over. No event. */
  | { status: 'NOTHING' };

/**
 * The department that bears the cost of a request on 01/01: the one its seats that count are borne by now (a service account handed over to
 * another department is charged to that one), else the department of the request — also when its seats are borne by more than one, since
 * a request holds one commitment for a year.
 */
export function bearingDepartmentOf(input: {
  year: number;
  seats: readonly YearStartSeat[];
  requestDepartmentId: string;
}): string {
  const yearStart: BusinessDate = `${input.year}-01-01`;
  const departments = new Set(
    input.seats
      .filter((seat) => seatCountsOn(seat, yearStart))
      .map((seat) => seat.departmentId ?? input.requestDepartmentId),
  );
  const [only] = departments;

  return departments.size === 1 && only !== undefined ? only : input.requestDepartmentId;
}

/** What the pass does with one request: commits its amount in the Cost Center of its department, leaves it out for want of a price or a Cost Center, or has nothing to commit. */
export function judgeYearStart(input: {
  year: number;
  seats: readonly YearStartSeat[];
  price: YearStartPrice | null;
  /** The Cost Center in use of the department that bears the cost; null when it has none. */
  costCenterId: string | null;
}): YearStartJudgement {
  const priced = yearStartAmountOf(input);
  if (priced.status === 'SKIPPED') {
    return priced.reason === 'NO_SEAT' ? { status: 'NOTHING' } : { status: 'LEFT_OUT', reason: priced.reason };
  }
  if (input.costCenterId === null) return { status: 'LEFT_OUT', reason: 'NO_COST_CENTER' };

  return {
    status: 'COMMIT',
    amountMinor: priced.amountMinor,
    seatMonthlyMinor: priced.seatMonthlyMinor,
    currency: priced.currency,
    costCenterId: input.costCenterId,
  };
}
