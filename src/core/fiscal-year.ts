import type { BusinessDate } from './business-date';

/**
 * The fiscal year a day belongs to: the calendar year, 1 January to 31 December (`QĐ-104e`(1), `FR-5.1`). The year the
 * budget of every Cost Center is made for, the year of a request and the year a commitment falls in are this year; no
 * operating parameter moves where it begins.
 */
export function fiscalYearOf(date: BusinessDate): number {
  return Number(date.slice(0, 4));
}

const DAYS_IN_MONTH = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The day `months` months after `date`, on the same day of the month or on the last day of a shorter month. */
export function addMonths(date: BusinessDate, months: number): BusinessDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const targetDay = Math.min(day, DAYS_IN_MONTH(targetYear, targetMonth));
  const pad = (value: number, width: number) => String(value).padStart(width, '0');

  return `${pad(targetYear, 4)}-${pad(targetMonth, 2)}-${pad(targetDay, 2)}`;
}

/**
 * The place, as a whole number of steps, of the first day of the grid `addMonths(anchor, k * stepMonths)` (`k` any whole number, so before the anchor as
 * well as after it) that is not before `from`: the day of a payment that repeats by a cycle, counted from a stored day both ways. The day of the grid is
 * always counted from the anchor, never from the day before it, so a shorter month ends on its last day without moving the day of the next. Pure.
 */
export function firstGridOffsetFrom(anchor: BusinessDate, stepMonths: number, from: BusinessDate): number {
  const monthIndex = (day: BusinessDate): number => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
  let at = Math.floor((monthIndex(from) - monthIndex(anchor)) / stepMonths);
  while (addMonths(anchor, (at - 1) * stepMonths) >= from) at -= 1;
  while (addMonths(anchor, at * stepMonths) < from) at += 1;

  return at;
}
