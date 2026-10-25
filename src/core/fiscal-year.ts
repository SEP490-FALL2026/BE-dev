import type { BusinessDate } from './business-date';

/**
 * The fiscal year a day belongs to, named after the calendar year it begins in: with a year that begins in April, the
 * 31st of March 2027 is in fiscal year 2026 and the 1st of April 2027 in 2027. With a year that begins in January it is
 * the calendar year. The month the year begins in is an operating parameter (`FISCAL_YEAR_START_MONTH`, `QĐ-82e`), and
 * the budget period of every Cost Center is this year.
 */
export function fiscalYearOf(date: BusinessDate, startMonth: number): number {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error(`The fiscal year begins in a month from 1 to 12, not ${startMonth}.`);
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));

  return month >= startMonth ? year : year - 1;
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
