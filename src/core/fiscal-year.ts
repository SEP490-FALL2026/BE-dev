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
