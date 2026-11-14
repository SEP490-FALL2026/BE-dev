import { addDays, type BusinessDate } from './business-date';
import { addMonths, fiscalYearOf } from './fiscal-year';

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

/**
 * The end a seat has once its grant is completed on `grantedOn` (`BR-MF1-06a`, `QĐ-106b`): the end the request asked for, at the latest a
 * year after that day, the day before the same day twelve months later. A right with no end keeps none.
 */
export const endAfterGrant = (facts: {
  expectedEndDate: BusinessDate | null;
  grantedOn: BusinessDate;
}): BusinessDate | null => {
  if (facts.expectedEndDate === null) return null;
  const latest = termEndOf(facts.grantedOn, TERM_LIMIT_MONTHS);

  return facts.expectedEndDate > latest ? latest : facts.expectedEndDate;
};

export type TermKind = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

/** The most months a request for `K1` asks for: a plan bought by the month is not a plan to keep (`QĐ-106b`, `QĐ-111i`). */
export const K1_TERM_LIMIT_MONTHS = 9;

/** Why the time of use a request gives is refused (`QĐ-111i`, `FR-2.8`, `INV-07`). */
export type TermRefusal =
  'TERM_REQUIRED' | 'TERM_MONTHS_OUT_OF_RANGE' | 'TERM_NOT_ASKED' | 'TERM_LONG_TERM_NOT_ALLOWED';

/**
 * Whether the time of use is asked for a kind of grant, and how long it may be: `K1` asks 1 to 9 months and takes no right without an end;
 * `K2` and `K5` ask 1 to 12 months or none (_Dùng lâu dài_); `K4` is a purchase and asks nothing (`QĐ-111i`).
 */
export const termRuleOf = (kind: TermKind): { asked: boolean; maxMonths: number; longTermAllowed: boolean } => {
  if (kind === 'K4') return { asked: false, maxMonths: 0, longTermAllowed: false };
  if (kind === 'K1') return { asked: true, maxMonths: K1_TERM_LIMIT_MONTHS, longTermAllowed: false };

  return { asked: true, maxMonths: TERM_LIMIT_MONTHS, longTermAllowed: true };
};

/**
 * What is wrong with the time of use a request gives for a kind of grant, or null when it is fine. `termMonths` is the number, null for
 * _Dùng lâu dài_, undefined when the form says nothing; a person with a term (a contractor, a freelancer, an intern) gives the months and
 * is never granted a right with no end (`INV-07`): saying nothing is a missing field, null is a refused answer.
 */
export function checkTermMonths(facts: {
  kind: TermKind;
  termMonths: number | null | undefined;
  fixedTermPerson: boolean;
  /**
   * The end of the contract of the person is known. A plan bought once asks no months, so the seat of a person with a term can end only
   * there (`INV-07`): without it the right would have no end, which is refused as any right with no end for them.
   */
  contractEndKnown?: boolean;
}): TermRefusal | null {
  const rule = termRuleOf(facts.kind);
  const { termMonths } = facts;
  if (!rule.asked) {
    if (typeof termMonths === 'number') return 'TERM_NOT_ASKED';

    return facts.fixedTermPerson && facts.contractEndKnown !== true ? 'TERM_LONG_TERM_NOT_ALLOWED' : null;
  }
  if (typeof termMonths === 'number') {
    return Number.isInteger(termMonths) && termMonths >= 1 && termMonths <= rule.maxMonths
      ? null
      : 'TERM_MONTHS_OUT_OF_RANGE';
  }

  return checkNoMonths(rule.longTermAllowed, termMonths, facts.fixedTermPerson);
}

/**
 * No months were given: nothing said is a missing field, null is a right with no end. A person with a term never gets one, on any plan (a null
 * from them is refused, T-R38); for the others it is fine where the plan takes it (K2, K5) and missing months where it does not (K1).
 */
function checkNoMonths(
  longTermAllowed: boolean,
  termMonths: null | undefined,
  fixedTermPerson: boolean,
): TermRefusal | null {
  if (fixedTermPerson) return termMonths === null ? 'TERM_LONG_TERM_NOT_ALLOWED' : 'TERM_REQUIRED';

  return longTermAllowed ? null : 'TERM_REQUIRED';
}

/** A term as it runs for one person from the day it begins (`QĐ-111i`, `QĐ-111j`, R-38, R-39). */
export interface TermRun {
  start: BusinessDate;
  /** The months asked; null for a right with no end. */
  months: number | null;
  /** The last day of the right; null for a right with no end. */
  end: BusinessDate | null;
  /** The last day of the contract when it cut the term short; null when nothing was cut. */
  cutAt: BusinessDate | null;
  /** The months that have begun by the end, each one counted whole (R-39); null for a right with no end. */
  startedMonths: number | null;
}

/**
 * The run of `months` months from `start` for a person whose contract ends on `contractEndDate` (null: none known). The last day is the day
 * before the same day `months` later, cut at the end of the contract when that comes first (R-38: the person is not refused, the term is
 * cut); a month counts as soon as it begins (R-39): month k begins `k − 1` months after `start`. A contract that ended already still leaves
 * the day the right begins and one month, so no right ends before it begins. A right with no end is never cut.
 */
export function termRunOf(facts: {
  start: BusinessDate;
  months: number | null;
  contractEndDate: BusinessDate | null;
}): TermRun {
  const { start, months, contractEndDate } = facts;
  if (months === null) return { start, months, end: null, cutAt: null, startedMonths: null };
  const derived = termEndOf(start, months);
  const cut = contractEndDate !== null && contractEndDate < derived;
  const end = cut ? (contractEndDate > start ? contractEndDate : start) : derived;
  let startedMonths = 0;
  for (let month = 0; month < months && addMonths(start, month) <= end; month += 1) startedMonths += 1;

  return { start, months, end, cutAt: cut ? end : null, startedMonths: Math.max(1, startedMonths) };
}

/**
 * The months of a term that begin in `year`: a month begins every month from `start` until `end` (for ever with no end) and belongs to the
 * year of the day it begins (`QĐ-111j`). What each year costs is the price of a month times this.
 */
export function monthsBeginningIn(facts: { start: BusinessDate; end: BusinessDate | null; year: number }): number {
  let count = 0;
  for (let month = 0; ; month += 1) {
    const day = addMonths(facts.start, month);
    const year = fiscalYearOf(day);
    if (year > facts.year || (facts.end !== null && day > facts.end)) return count;
    if (year === facts.year) count += 1;
  }
}

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
