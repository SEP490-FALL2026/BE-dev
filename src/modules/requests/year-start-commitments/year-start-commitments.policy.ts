import { addDays, type BusinessDate } from '../../../core/business-date';
import { DONG, MAX_AMOUNT_MINOR, type Money } from '../../../core/money/money';
import type { BillingCycleCode } from '../access-request/access-request.types';
import { monthlyPriceOf, requestAmountOf } from '../access-request/pricing.policy';

/**
 * What the commitment made on 01/01 holds (`FR-5.8`(6), `BR-MF1-09`, `QĐ-109a`, `QĐ-111ak`), as pure decisions. A request whose right goes on
 * into the new year, or that was approved as spend and not yet granted, holds one commitment for that year: for each seat it stands for that
 * still stands after 31/12, what its approval kept of the year after (a request for months of use), or twelve months of the price of a month
 * on 01/01 (a right with no end). Nothing is judged against the budget; the commitment is made, and waits for a budget when the year has none yet. A right that is not a request's (a seat of the
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
  /** The request asked for months of use (`QĐ-111i`): the seat is not a right with no end, even while it has no end day yet. */
  termLimited: boolean;
  /** What the approval kept of this seat for the year that begins (`QĐ-111k`, M-13): null when it kept nothing (a request of an older release). */
  savedMinor: bigint | null;
  /**
   * The price of a seat the approval worked the kept number out at, in dong (the unit price and billing cycle the request carries): a seat that
   * closes before its term is counted at this price, never at the price of 01/01 (`QĐ-111ak`). Null when the request does not carry one.
   */
  approvalPrice: Pick<YearStartPrice, 'unitPrice' | 'billingCycle'> | null;
}

/** What a plan is bought at, as the catalog says it. */
export interface YearStartPrice {
  kind: 'RECURRING' | 'ONE_TIME';
  unitPrice: Money;
  monthlyPriceMinor?: bigint | null;
  billingCycle: BillingCycleCode | null;
}

export type YearStartSkipReason =
  /** The plan has no usable recurring price, or its price is left in another currency than dong: nothing is guessed or converted (`QĐ-84e`, `QĐ-111an`). */
  | 'NO_PRICE'
  /** Nothing of the request is left to commit on 01/01: every seat is over, or none was ever made. */
  | 'NO_SEAT'
  /** The department that bears the cost has no Cost Center in use. */
  | 'NO_COST_CENTER'
  /** The amount is more than a money value may hold. */
  | 'AMOUNT_TOO_LARGE';

export type YearStartAmount =
  | { status: 'PRICED'; amountMinor: bigint; seatMonthlyMinor: bigint; currency: string }
  | { status: 'SKIPPED'; reason: Extract<YearStartSkipReason, 'NO_PRICE' | 'NO_SEAT' | 'AMOUNT_TOO_LARGE'> };

/**
 * Whether a plan has a price to commit: a recurring one in dong. Every price is in dong (`QĐ-111an`) and nothing is converted, so a price an
 * older release left in another currency holds nothing.
 */
function isRecurringPriceInDong(price: YearStartPrice | null): price is YearStartPrice {
  return price !== null && price.kind === 'RECURRING' && price.unitPrice.currency === DONG;
}

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

const ceilDiv = (dividend: bigint, divisor: bigint): bigint => (dividend + divisor - 1n) / divisor;

/** The price of a month a right with no end was approved at, from what the approval kept of the year (twelve months, rounded up to the minor unit). */
export const approvalMonthlyFromSaved = (savedMinor: bigint): bigint => ceilDiv(savedMinor, 12n);

function approvalPriceOfSeat(seat: YearStartSeat): Pick<YearStartPrice, 'unitPrice' | 'billingCycle'> | null {
  if (seat.approvalPrice !== null) return seat.approvalPrice;
  if (!seat.termLimited && seat.savedMinor !== null) {
    return {
      unitPrice: { amountMinor: approvalMonthlyFromSaved(seat.savedMinor), currency: DONG },
      billingCycle: 'MONTHLY',
    };
  }

  return null;
}

function approvalMonthlyOfNonTermSeat(seat: YearStartSeat): bigint | null {
  if (seat.termLimited || seat.savedMinor === null) return null;
  const monthly = seat.approvalPrice !== null ? monthlyPriceOf(seat.approvalPrice) : null;

  return monthly ? monthly.amountMinor : approvalMonthlyFromSaved(seat.savedMinor);
}

/**
 * What the approval kept of the seat (`savedMinor`): for a request for months of use, only from the year after approval; for a right
 * with no end, across every year after approval. Returns null when nothing was kept. A seat that closes in the new year before its end
 * holds the months it has left at the price the approval counted with, capped at `savedMinor`.
 */
function keptAmountOf(seat: YearStartSeat, yearStart: BusinessDate): bigint | null {
  if (seat.savedMinor === null) return null;
  const closes = seat.validUntil === null ? null : addDays(seat.validUntil, -1);
  const closesBeforeEnd = closes !== null && (seat.expectedEndDate === null || closes < seat.expectedEndDate);
  const price = closesBeforeEnd ? approvalPriceOfSeat(seat) : null;
  if (!closesBeforeEnd || price === null) return seat.savedMinor;

  const monthsToClose = requestAmountOf({
    kind: 'RECURRING',
    unitPrice: price.unitPrice,
    billingCycle: price.billingCycle,
    beneficiaries: 1,
    checkDate: yearStart,
    endDate: closes,
  });
  if (monthsToClose.status === 'MISSING') return seat.savedMinor;

  return monthsToClose.amount.amountMinor < seat.savedMinor ? monthsToClose.amount.amountMinor : seat.savedMinor;
}

type PricedByEnd = { ok: true; total: bigint } | { ok: false; reason: 'AMOUNT_TOO_LARGE' | 'NO_PRICE' };

function priceSeatsByEnd(
  seatsByEnd: ReadonlyMap<string | null, number>,
  price: YearStartPrice,
  yearStart: BusinessDate,
): PricedByEnd {
  let total = 0n;
  for (const [endDate, beneficiaries] of seatsByEnd) {
    const priced = requestAmountOf({
      kind: 'RECURRING',
      unitPrice: price.unitPrice,
      monthlyPriceMinor: price.monthlyPriceMinor,
      billingCycle: price.billingCycle,
      beneficiaries,
      checkDate: yearStart,
      endDate,
    });
    if (priced.status === 'MISSING') {
      return { ok: false, reason: priced.reason === 'AMOUNT_TOO_LARGE' ? 'AMOUNT_TOO_LARGE' : 'NO_PRICE' };
    }
    total += priced.amount.amountMinor;
  }

  return { ok: true, total };
}

/** What the seats with no number kept cost at the price of 01/01, with the price of one month of it: asked only when something of the request needs that price. */
function priceAtToday(
  price: YearStartPrice | null,
  seatsByEnd: ReadonlyMap<string | null, number>,
  yearStart: BusinessDate,
): { ok: true; total: bigint; monthlyMinor: bigint } | { ok: false; reason: 'AMOUNT_TOO_LARGE' | 'NO_PRICE' } {
  if (!isRecurringPriceInDong(price)) return { ok: false, reason: 'NO_PRICE' };
  const monthly = monthlyPriceOf({
    unitPrice: price.unitPrice,
    monthlyPriceMinor: price.monthlyPriceMinor,
    billingCycle: price.billingCycle,
  });
  if (monthly === null || monthly.amountMinor <= 0n) return { ok: false, reason: 'NO_PRICE' };
  const remainder = priceSeatsByEnd(seatsByEnd, price, yearStart);

  return remainder.ok ? { ok: true, total: remainder.total, monthlyMinor: monthly.amountMinor } : remainder;
}

/**
 * The amount of the commitment of one request on 01/01, the one rule of the pass and of the amount carried over into the next year: each
 * standing seat holds what its approval kept (or prorated months on early close at the approval rate); seats without a saved number use the
 * price on 01/01 via `requestAmountOf`.
 */
export function yearStartAmountOf(input: {
  year: number;
  seats: readonly YearStartSeat[];
  price: YearStartPrice | null;
}): YearStartAmount {
  const yearStart: BusinessDate = `${input.year}-01-01`;
  const counted = input.seats.filter((seat) => seatCountsOn(seat, yearStart));
  if (counted.length === 0) return { status: 'SKIPPED', reason: 'NO_SEAT' };

  // Seats that end on the same day cost the same: one calculation for each end date, not for each seat.
  const seatsByEnd = new Map<string | null, number>();
  let total = 0n;
  let savedMonthlyMinor: bigint | null = null;
  for (const seat of counted) {
    const kept = keptAmountOf(seat, yearStart);
    if (kept !== null) {
      savedMonthlyMinor ??= approvalMonthlyOfNonTermSeat(seat);
      total += kept;
      continue;
    }
    const last = lastDayOfSeat(seat);
    seatsByEnd.set(last, (seatsByEnd.get(last) ?? 0) + 1);
  }
  // A seat the approval kept a number for is committed at that number, whatever the plan costs today (twelve months at the price of the approval): the price of
  // 01/01 is asked only for a seat with no number kept, and for the price of a month of a seat that has no monthly price of its own.
  let seatMonthlyMinor = savedMonthlyMinor;
  if (seatsByEnd.size > 0 || seatMonthlyMinor === null) {
    const today = priceAtToday(input.price, seatsByEnd, yearStart);
    if (!today.ok) return { status: 'SKIPPED', reason: today.reason };
    total += today.total;
    seatMonthlyMinor ??= today.monthlyMinor;
  }
  // Each end date is within the range, the seats of all of them together may not be.
  if (total > MAX_AMOUNT_MINOR) return { status: 'SKIPPED', reason: 'AMOUNT_TOO_LARGE' };
  if (seatMonthlyMinor === null) return { status: 'SKIPPED', reason: 'NO_PRICE' };

  return { status: 'PRICED', amountMinor: total, seatMonthlyMinor, currency: DONG };
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

/**
 * What each of the Cost Centers asked about carries into the year (`QĐ-111ac`): the amounts of the commitments the pass of 01/01 would make,
 * added by Cost Center. A Cost Center nothing would be committed in is left out of the answer. The amounts are in dong, like every
 * commitment of the pass (`QĐ-111an`).
 */
export function carriedOverByCostCenter(
  commitments: readonly { costCenterId: string; amountMinor: bigint }[],
  costCenterIds: readonly string[],
): Map<string, bigint> {
  const wanted = new Set(costCenterIds);
  const totals = new Map<string, bigint>();
  for (const commitment of commitments) {
    if (!wanted.has(commitment.costCenterId)) continue;
    totals.set(commitment.costCenterId, (totals.get(commitment.costCenterId) ?? 0n) + commitment.amountMinor);
  }

  return totals;
}

/** Monthly seat counts in `year` from 01/01 through each counted seat's end month (`W3-07` for K2). */
export function yearStartMonthsOf(input: {
  year: number;
  seats: readonly YearStartSeat[];
}): { month: BusinessDate; seatCount: number }[] {
  const yearStart: BusinessDate = `${input.year}-01-01`;
  const counts = new Map<number, number>();
  for (const seat of input.seats) {
    if (!seatCountsOn(seat, yearStart)) continue;
    const last = lastDayOfSeat(seat);
    const lastYear = last === null ? input.year + 1 : Number(last.slice(0, 4));
    const lastMonth = last === null || lastYear > input.year ? 12 : Number(last.slice(5, 7));
    for (let m = 1; m <= lastMonth; m++) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([m, seatCount]) => ({
      month: `${input.year}-${String(m).padStart(2, '0')}-01`,
      seatCount,
    }));
}
