import { addDays, type BusinessDate } from './business-date';
import { addMonths } from './fiscal-year';

/**
 * The term a request may ask for (`QĐ-98`, `US-05-01` AC-4): at most a year. A right is not cut at the end of the calendar
 * year: its last day is the day before the same day `months` later (`QĐ-104a`, `US-05-23`). Pure: the services read the facts
 * (when does it start) and these decide.
 */

/** The most months any request asks for; a longer stay is renewed by a new request, not confirmed in words. */
export const TERM_LIMIT_MONTHS = 12;

export interface TermLimit {
  maxMonths: number;
}

export const termLimitOf = (): TermLimit => ({ maxMonths: TERM_LIMIT_MONTHS });

/** The last day of a term of `months` months that begins on `start`: the day before the same day `months` later. */
export const termEndOf = (start: BusinessDate, months: number): BusinessDate => addDays(addMonths(start, months), -1);

/** The limit when the term is longer than a request may ask for, or null when it is allowed. */
export function checkTerm(facts: { months: number }): TermLimit | null {
  const limit = termLimitOf();
  if (facts.months > limit.maxMonths) return limit;

  return null;
}

/** The day a renewal begins: the day after the right ends, or today when the right has ended already (`QĐ-98`). */
export const renewalStartOf = (facts: { previousEnd: BusinessDate; today: BusinessDate }): BusinessDate =>
  facts.today <= facts.previousEnd ? addDays(facts.previousEnd, 1) : facts.today;

/**
 * The last day of a renewal that asks for `months` more (`QĐ-98`, R-15): it begins on `renewalStartOf` and runs for the
 * months asked, never cut at the end of a calendar year.
 */
export const renewalEndOf = (facts: { previousEnd: BusinessDate; today: BusinessDate; months: number }): BusinessDate =>
  effectiveEndOf({ start: renewalStartOf(facts), months: facts.months });

/**
 * The last day of a term of `months` months that begins on `start`: the day a seat granted for the term ends when nobody
 * gave it another (`QĐ-98`, R-15).
 */
export const effectiveEndOf = (facts: { start: BusinessDate; months: number }): BusinessDate =>
  termEndOf(facts.start, facts.months);
