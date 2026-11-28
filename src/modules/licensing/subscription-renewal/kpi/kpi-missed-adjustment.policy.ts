import { addDays, monthBoundsOf, type BusinessDate } from '../../../../core/business-date';
import { roundHalfAway } from '../../../../core/seat-month-cost';

export interface MissedSeatsInput {
  seatCounting: 'FIXED' | 'MEMBERS';
  seatsAtPeriodStart: number | null;
  priorLockedTarget: number | null;
}

export interface LineMonthKpi4Input {
  seatCounting: 'FIXED' | 'MEMBERS';
  missedSeats: number;
  monthlyUnitPriceMinor: bigint | null;
  month: BusinessDate;
  startDate: BusinessDate | null;
  endExclusive: BusinessDate | null;
  dailySeats?: ReadonlyMap<BusinessDate, number | null>;
  fallbackQuantity: number | null;
  heldSeats: ReadonlyArray<{ heldFrom: BusinessDate; heldUntil: BusinessDate | null }>;
}

export interface MonthKpi4Result {
  missedIdleSeatDays: number;
  daysInMonth: number;
  seatMonths: number;
  amountMinor: bigint;
}

const DAY_MS = 86_400_000;

function calendarDays(from: BusinessDate, to: BusinessDate): number {
  if (to <= from) return 0;

  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function countHeldOnDay(
  seats: ReadonlyArray<{ heldFrom: BusinessDate; heldUntil: BusinessDate | null }>,
  day: BusinessDate,
): number {
  let count = 0;
  for (const seat of seats) {
    if (seat.heldFrom <= day && (seat.heldUntil === null || day < seat.heldUntil)) {
      count += 1;
    }
  }

  return count;
}

function activeDatesInMonth(
  month: BusinessDate,
  startDate: BusinessDate | null,
  endExclusive: BusinessDate | null,
): BusinessDate[] {
  const { start, nextStart } = monthBoundsOf(month);
  const from = startDate !== null && startDate > start ? startDate : start;
  const until = endExclusive !== null && endExclusive < nextStart ? endExclusive : nextStart;
  const count = calendarDays(from, until);
  const dates: BusinessDate[] = [];
  for (let i = 0; i < count; i += 1) {
    dates.push(addDays(from, i));
  }

  return dates;
}

/**
 * Seats missed at the prior adjustment point for one line: `max(0, seats(L, periodStart) - priorLockedTarget)`.
 * Member-counted (`MEMBERS`) subscriptions never record missed adjustment seats (`0`).
 */
export function missedSeatsOf(input: MissedSeatsInput): number {
  if (input.seatCounting !== 'FIXED') return 0;
  if (input.seatsAtPeriodStart === null || input.priorLockedTarget === null) return 0;

  return Math.max(0, input.seatsAtPeriodStart - input.priorLockedTarget);
}

/** Daily missed-adjustment idle seats: `min(idleSeats, missedSeats)`, clamped at 0. */
export function missedIdleOfDay(idleSeats: number, missedSeats: number): number {
  if (idleSeats <= 0 || missedSeats <= 0) return 0;

  return Math.min(idleSeats, missedSeats);
}

/** Resolves the locked target of `priorLineId` at or before `periodStartDate`, preferring the latest renewal date. */
export function resolvePriorLockedTarget(
  targets: ReadonlyArray<{ subscriptionLineId: string; renewalOn: BusinessDate; target: number }>,
  priorLineId: string | null,
  periodStartDate: BusinessDate | null,
): number | null {
  if (priorLineId === null || periodStartDate === null) return null;
  let best: { renewalOn: BusinessDate; target: number } | null = null;
  for (const row of targets) {
    if (row.subscriptionLineId !== priorLineId || row.renewalOn > periodStartDate) continue;
    if (best === null || row.renewalOn > best.renewalOn) {
      best = row;
    }
  }

  return best?.target ?? null;
}

/**
 * Computes incremental monthly `KPI-4` (`Σ_d missedIdle(d) / D` seat-months and VND cost) for one subscription line.
 * Member-counted (`MEMBERS`) subscriptions always yield `0` seat-months and `0n`.
 */
export function lineMonthKpi4(input: LineMonthKpi4Input): MonthKpi4Result {
  const { start, nextStart } = monthBoundsOf(input.month);
  const daysInMonth = calendarDays(start, nextStart);
  if (input.seatCounting !== 'FIXED' || input.missedSeats <= 0 || daysInMonth <= 0) {
    return { missedIdleSeatDays: 0, daysInMonth, seatMonths: 0, amountMinor: 0n };
  }

  let missedIdleSeatDays = 0;
  for (const day of activeDatesInMonth(input.month, input.startDate, input.endExclusive)) {
    const seatsToday =
      (input.dailySeats ? input.dailySeats.get(day) : input.fallbackQuantity) ?? input.fallbackQuantity;
    if (seatsToday === null || seatsToday === undefined) continue;
    const heldToday = countHeldOnDay(input.heldSeats, day);
    const idleToday = Math.max(0, seatsToday - heldToday);
    missedIdleSeatDays += missedIdleOfDay(idleToday, input.missedSeats);
  }

  const seatMonths = missedIdleSeatDays / daysInMonth;
  const amountMinor =
    input.monthlyUnitPriceMinor !== null
      ? roundHalfAway(BigInt(missedIdleSeatDays) * input.monthlyUnitPriceMinor, BigInt(daysInMonth))
      : 0n;

  return { missedIdleSeatDays, daysInMonth, seatMonths, amountMinor };
}

/** Sums incremental monthly `KPI-4` seat-months and VND costs across months or lines. */
export function accumulateKpi4Months(months: readonly MonthKpi4Result[]): {
  totalMissedIdleSeatDays: number;
  totalSeatMonths: number;
  totalAmountMinor: bigint;
} {
  let totalMissedIdleSeatDays = 0;
  let totalSeatMonths = 0;
  let totalAmountMinor = 0n;
  for (const item of months) {
    totalMissedIdleSeatDays += item.missedIdleSeatDays;
    totalSeatMonths += item.seatMonths;
    totalAmountMinor += item.amountMinor;
  }

  return {
    totalMissedIdleSeatDays,
    totalSeatMonths: Number(totalSeatMonths.toFixed(6)),
    totalAmountMinor,
  };
}
