import { addDays, monthBoundsOf, type BusinessDate } from './business-date';
import { addMonths, firstGridOffsetFrom } from './fiscal-year';

/**
 * The cost a seat has in the days of a month (`BR-MF1-08`, `M-06`, `M-10`): the commitment of a K1 or K2 right is a price a month, and when
 * a right ends or begins in the middle of a month only the days it is in force are used. Pure: no calendar of the organization is read, the
 * caller gives the dates in it. Every amount is in the smallest unit of the currency; a share of a month is rounded half up to that unit.
 */

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const parts = (day: BusinessDate): { year: number; month: number; day: number } => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)),
  day: Number(day.slice(8, 10)),
});

const divideHalfUp = (numerator: bigint, denominator: bigint): bigint =>
  (2n * numerator + denominator) / (2n * denominator);

/** `numerator ÷ denominator` rounded half away from zero; `denominator` is positive. */
export function roundHalfAway(numerator: bigint, denominator: bigint): bigint {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (2n * magnitude + denominator) / (2n * denominator);

  return numerator < 0n ? -rounded : rounded;
}

/** What the days of the month of `day` before it cost: the price a month times the days before `day` over the days of the month. Day 1 costs nothing. */
export function monthCostBefore(monthlyMinor: bigint, day: BusinessDate): bigint {
  const { year, month, day: dayOfMonth } = parts(day);

  return divideHalfUp(monthlyMinor * BigInt(dayOfMonth - 1), BigInt(daysInMonth(year, month)));
}

/**
 * What a revocation gives back (`RV-07`): the months from the month of `endsOn` (the first day the right no longer holds the seat) to
 * `lastMonth` of that year, less what the days of the month of `endsOn` before it have already cost. A right that ends on day 1 gives back
 * the whole month. Zero when the last month is before the month of `endsOn`.
 */
export function releaseOnRevocation(input: { monthlyMinor: bigint; endsOn: BusinessDate; lastMonth: number }): bigint {
  const { month } = parts(input.endsOn);
  const months = Math.max(0, input.lastMonth - month + 1);
  if (months === 0) return 0n;

  return input.monthlyMinor * BigInt(months) - monthCostBefore(input.monthlyMinor, input.endsOn);
}

/**
 * What a grant in the middle of a month gives back (`M-10`): the months from `firstMonth` to the month before the one of `grantedOn`, and the
 * days of the month of `grantedOn` before it, which the right was not in force for. Zero when the grant is in `firstMonth` on day 1.
 */
export function releaseOnLateGrant(input: {
  monthlyMinor: bigint;
  grantedOn: BusinessDate;
  firstMonth: number;
}): bigint {
  const { month } = parts(input.grantedOn);
  const wholeMonths = Math.max(0, month - input.firstMonth);

  return input.monthlyMinor * BigInt(wholeMonths) + monthCostBefore(input.monthlyMinor, input.grantedOn);
}

/**
 * The days a seat is in force: from the day the right begins (the day the grant was completed, else the day the seat was decided) up to the first day
 * it no longer holds (`until`, null while open). A seat a Request asked for (`needsGrant`) has no right until its grant is completed, and begins on that
 * day, never on the day it was decided (`QĐ-103f`(3), `SM1-02`). Null when the period is empty (the seat was taken back before the right began, or is
 * still waiting for its grant): it costs nothing.
 */
export function seatHeldRange(input: {
  validFrom: BusinessDate;
  grantedOn: BusinessDate | null;
  validUntil: BusinessDate | null;
  needsGrant?: boolean;
}): { from: BusinessDate; until: BusinessDate | null } | null {
  if (input.needsGrant === true && input.grantedOn === null) return null;
  const from = input.grantedOn ?? input.validFrom;
  if (input.validUntil !== null && input.validUntil <= from) return null;

  return { from, until: input.validUntil };
}

const DAY_MS = 86_400_000;

export type BillingCycleKind = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';

function calendarDaysBetween(from: BusinessDate, to: BusinessDate): number {
  if (to <= from) return 0;

  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }

  return x === 0n ? 1n : x;
}

function addFraction(a: { num: bigint; den: bigint }, b: { num: bigint; den: bigint }): { num: bigint; den: bigint } {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  const divisor = gcdBigInt(num, den);

  return { num: num / divisor, den: den / divisor };
}

/**
 * Exact rational sum of `coveredDays_m / daysInMonth_m` over every calendar month intersecting `[from, toInclusive]`,
 * allowing callers to round once after multiplying by monthly price and seat count.
 */
export function coverFraction(from: BusinessDate, toInclusive: BusinessDate): { num: bigint; den: bigint } {
  if (from > toInclusive) return { num: 0n, den: 1n };
  const endExclusive = addDays(toInclusive, 1);
  let total = { num: 0n, den: 1n };
  let cursor = from;

  while (cursor < endExclusive) {
    const { start, nextStart } = monthBoundsOf(cursor);
    const segEnd = endExclusive < nextStart ? endExclusive : nextStart;
    const daysInMonth = calendarDaysBetween(start, nextStart);
    const coveredDays = calendarDaysBetween(cursor, segEnd);
    const piece =
      coveredDays === daysInMonth ? { num: 1n, den: 1n } : { num: BigInt(coveredDays), den: BigInt(daysInMonth) };
    total = addFraction(total, piece);
    cursor = segEnd;
  }

  return total;
}

/**
 * First renewal or billing payment boundary `R` strictly after `fromDate`:
 * - `ANNUAL`: `renewalDate ?? (endDate + 1)`
 * - `MONTHLY` / `QUARTERLY`: first grid date strictly after `fromDate` anchored at `renewalDate ?? endDate`.
 */
export function nextBillingBoundary(input: {
  billingCycle: BillingCycleKind | null;
  renewalDate: BusinessDate | null;
  endDate: BusinessDate | null;
  fromDate: BusinessDate;
}): BusinessDate | null {
  if (input.billingCycle === 'ANNUAL') {
    return input.renewalDate ?? (input.endDate !== null ? addDays(input.endDate, 1) : null);
  }
  if (input.billingCycle === 'MONTHLY' || input.billingCycle === 'QUARTERLY') {
    const anchor = input.renewalDate ?? input.endDate;
    if (anchor === null) return null;
    const stepMonths = input.billingCycle === 'MONTHLY' ? 1 : 3;
    const offset = firstGridOffsetFrom(anchor, stepMonths, addDays(input.fromDate, 1));

    return addMonths(anchor, offset * stepMonths);
  }

  return null;
}

/**
 * Computes `roundHalfAway(monthlyMinor * seats * coverFraction(from, untilExclusive - 1))` with a single rounding step.
 */
export function proratedSeatAmount(input: {
  monthlyMinor: bigint;
  seats: number;
  from: BusinessDate;
  untilExclusive: BusinessDate;
}): bigint {
  if (input.seats <= 0 || input.from >= input.untilExclusive) return 0n;
  const frac = coverFraction(input.from, addDays(input.untilExclusive, -1));

  return roundHalfAway(input.monthlyMinor * BigInt(input.seats) * frac.num, frac.den);
}
