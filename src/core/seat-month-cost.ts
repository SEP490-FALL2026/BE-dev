import type { BusinessDate } from './business-date';

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
