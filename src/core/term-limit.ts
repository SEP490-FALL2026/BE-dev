import { addDays, type BusinessDate } from './business-date';
import { addMonths, fiscalYearOf } from './fiscal-year';

/**
 * The term a request may ask for (`QĐ-98`, `US-05-01` AC-4): at most a year. A plan that can be cut mid-term (a flexible plan,
 * `allowsMidTermReduction`) is not refused past the end of the fiscal year it starts in: its end day is cut there (`effectiveEndOf`). Pure: the services read the facts (is the plan flexible, when does it start) and these decide.
 */

/** The most months any request asks for; a longer stay is renewed by a new request, not confirmed in words. */
export const TERM_LIMIT_MONTHS = 12;

export interface TermLimit {
  maxMonths: number;
  /** The last day a flexible plan may run to (the end of the fiscal year of the start); null for any other plan. */
  endsBy: BusinessDate | null;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The last day of the fiscal year `start` falls in. */
export function fiscalYearEndOf(start: BusinessDate, fiscalYearStartMonth: number): BusinessDate {
  const year = fiscalYearOf(start, fiscalYearStartMonth);

  return addDays(addMonths(`${String(year).padStart(4, '0')}-${pad(fiscalYearStartMonth)}-01`, 12), -1);
}

export function termLimitOf(facts: {
  start: BusinessDate;
  flexible: boolean;
  fiscalYearStartMonth: number;
}): TermLimit {
  return {
    maxMonths: TERM_LIMIT_MONTHS,
    endsBy: facts.flexible ? fiscalYearEndOf(facts.start, facts.fiscalYearStartMonth) : null,
  };
}

/** The last day of a term of `months` months that begins on `start`: the day before the same day `months` later. */
export const termEndOf = (start: BusinessDate, months: number): BusinessDate => addDays(addMonths(start, months), -1);

/** The limit when the term is longer than a request may ask for, or null when it is allowed. */
export function checkTerm(facts: {
  start: BusinessDate;
  months: number;
  flexible: boolean;
  fiscalYearStartMonth: number;
}): TermLimit | null {
  const limit = termLimitOf(facts);
  if (facts.months > limit.maxMonths) return limit;

  return null;
}

/** The day a renewal begins: the day after the right ends, or today when the right has ended already (`QĐ-98`). */
export const renewalStartOf = (facts: { previousEnd: BusinessDate; today: BusinessDate }): BusinessDate =>
  facts.today <= facts.previousEnd ? addDays(facts.previousEnd, 1) : facts.today;

/**
 * The last day of a renewal that asks for `months` more (`QĐ-98`, R-15): it begins on `renewalStartOf` and runs for the months asked,
 * cut at the end of the fiscal year it begins in when the subscription is flexible (the same function that ends a seat granted for a term).
 */
export function renewalEndOf(facts: {
  previousEnd: BusinessDate;
  today: BusinessDate;
  months: number;
  flexible: boolean;
  fiscalYearStartMonth: number;
}): BusinessDate {
  return effectiveEndOf({
    start: renewalStartOf(facts),
    months: facts.months,
    flexible: facts.flexible,
    fiscalYearStartMonth: facts.fiscalYearStartMonth,
  });
}

/**
 * The last day of a term of `months` months that begins on `start`, cut at the end of the fiscal year for a flexible plan: the day a
 * seat granted for the term ends when nobody gave it another (`QĐ-98`, R-15).
 */
export function effectiveEndOf(facts: {
  start: BusinessDate;
  months: number;
  flexible: boolean;
  fiscalYearStartMonth: number;
}): BusinessDate {
  const end = termEndOf(facts.start, facts.months);
  const { endsBy } = termLimitOf(facts);

  return endsBy !== null && end > endsBy ? endsBy : end;
}
