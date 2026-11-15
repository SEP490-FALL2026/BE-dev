import { addDays, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { HeldRange, PlacementPeriod, SeatMonthSegment } from './seat-month.types';

/**
 * What a seat of a K2 pool costs the department of the person who holds it, month by month (`SM-1`, `QĐ-103k`, `QĐ-111bg`): the price of a
 * month times the days the seat is held in the department over the days of the month, each share rounded half away from zero (`ADR-0007`) and
 * what rounding leaves over put on the last stretch, so the stretches of a seat always add up to the price of the days it is held. Pure: the
 * caller gives the days the seat is in force and where the person was placed; a day nobody was placed is no department's cost.
 */

/** `numerator ÷ denominator` rounded half away from zero; `denominator` is positive. */
export function roundHalfAway(numerator: bigint, denominator: bigint): bigint {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (2n * magnitude + denominator) / (2n * denominator);

  return numerator < 0n ? -rounded : rounded;
}

const daysBetween = (from: BusinessDate, to: BusinessDate): number =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);

const inRange = (day: BusinessDate, from: BusinessDate, until: BusinessDate | null): boolean =>
  day >= from && (until === null || day < until);

/** The days each department held the seat in the month, in the order of the last day each held it; the days nobody was placed are left out. */
function daysByDepartment(input: {
  month: BusinessDate;
  held: HeldRange;
  placements: readonly PlacementPeriod[];
  fixedDepartmentId?: string | null;
}): { departmentId: string; days: number }[] {
  const { start, nextStart } = monthBoundsOf(input.month);
  const lastDay = new Map<string, number>();
  const days = new Map<string, number>();
  for (let offset = 0; addDays(start, offset) < nextStart; offset += 1) {
    const day = addDays(start, offset);
    if (!inRange(day, input.held.from, input.held.until)) continue;
    const departmentId =
      input.fixedDepartmentId ?? input.placements.find((period) => inRange(day, period.from, period.to))?.departmentId;
    if (!departmentId) continue;
    days.set(departmentId, (days.get(departmentId) ?? 0) + 1);
    lastDay.set(departmentId, offset);
  }

  return [...days]
    .map(([departmentId, count]) => ({ departmentId, days: count, last: lastDay.get(departmentId) ?? 0 }))
    .sort((a, b) => a.last - b.last)
    .map(({ departmentId, days: count }) => ({ departmentId, days: count }));
}

/**
 * The stretches of a seat in a month and what each costs. The last stretch is what the days held cost altogether less the others, so the sum
 * is the price of the days held whatever the rounding of each share did. A seat not held in the month has none.
 */
export function splitSeatMonth(input: {
  monthlyPriceMinor: bigint;
  /** The first day of the month. */
  month: BusinessDate;
  held: HeldRange;
  placements: readonly PlacementPeriod[];
  /** A seat that answers to one department whoever holds it (a service account): every day is that department's. */
  fixedDepartmentId?: string | null;
}): SeatMonthSegment[] {
  const stretches = daysByDepartment(input);
  if (stretches.length === 0) return [];
  const { start, nextStart } = monthBoundsOf(input.month);
  const daysInMonth = BigInt(daysBetween(start, nextStart));
  const heldDays = BigInt(stretches.reduce((sum, stretch) => sum + stretch.days, 0));
  let remaining = roundHalfAway(input.monthlyPriceMinor * heldDays, daysInMonth);

  return stretches.map((stretch, index) => {
    const isLast = index === stretches.length - 1;
    const amountMinor = isLast ? remaining : roundHalfAway(input.monthlyPriceMinor * BigInt(stretch.days), daysInMonth);
    remaining -= amountMinor;

    return { departmentId: stretch.departmentId, days: stretch.days, amountMinor };
  });
}

/**
 * What a seat-month takes of the commitment of the seat (`US-06-06`): the whole amount, no more than the commitment still holds, and only
 * when the commitment is of the Cost Center that bears the month. Another Cost Center, or no commitment, takes nothing of it.
 */
export function commitmentApplication(input: {
  amountMinor: bigint;
  heldMinor: bigint;
  sameCostCenter: boolean;
}): bigint {
  if (!input.sameCostCenter || input.heldMinor <= 0n) return 0n;

  return input.amountMinor < input.heldMinor ? input.amountMinor : input.heldMinor;
}

/** The line the pool keeps for a subscription in a month: what its invoices cost less what the seats held took (`QĐ-104c`); not stored. */
export function stockLineMinor(input: { invoicedMinor: bigint; allocatedMinor: bigint }): bigint {
  return input.invoicedMinor - input.allocatedMinor;
}

/**
 * The months that have ended as of `today` and are still worth charging: the months of this year before the month of `today`, and December
 * of the year before while `today` is in January. Each is the first day of a month, the earliest first.
 */
export function endedMonthsOf(today: BusinessDate): BusinessDate[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month === 1) return [`${year - 1}-12-01`];

  return Array.from({ length: month - 1 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}-01`);
}
