/**
 * The days of the demo dataset, all relative to the business day the seed runs on (`ctx.today`), so the dataset shows the
 * same states whichever day it is applied. Pure functions on `YYYY-MM-DD` strings: no clock is read here.
 */

const MS_PER_DAY = 86_400_000;

function parse(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `day` + `days` calendar days (negative goes back). */
export function dayOffset(day: string, days: number): string {
  return format(new Date(parse(day).getTime() + days * MS_PER_DAY));
}

/** The last day of the month of `day`. */
export function endOfMonth(day: string): string {
  const date = parse(day);

  return format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

/** The same day `months` months later (earlier when negative), clamped to the last day of the target month. */
export function addMonths(day: string, months: number): string {
  const date = parse(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();

  return format(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), last))));
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / MS_PER_DAY);
}

/** The day `days` before the first of January of `year`. */
export function dayBeforeNewYear(year: number, days: number): string {
  return format(new Date(Date.UTC(year, 0, 1 - days)));
}
