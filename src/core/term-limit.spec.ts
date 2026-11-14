import {
  checkTerm,
  checkTermMonths,
  effectiveEndOf,
  endAfterGrant,
  monthsBeginningIn,
  renewalEndOf,
  renewalStartOf,
  termEndOf,
  termLimitOf,
  termRunOf,
  type TermKind,
} from './term-limit';

describe('the term a request may ask for (US-05-01 AC-4, QĐ-98)', () => {
  it('gives a year and nothing else: no end day at the end of the calendar year (QĐ-104a)', () => {
    expect(termLimitOf()).toEqual({ maxMonths: 12 });
  });

  it('ends a term the day before the same day months later', () => {
    expect(termEndOf('2026-11-05', 1)).toBe('2026-12-04');
    expect(termEndOf('2026-01-31', 1)).toBe('2026-02-27');
  });

  it('allows twelve months and refuses thirteen', () => {
    expect(checkTerm({ months: 12 })).toBeNull();
    expect(checkTerm({ months: 13 })).toEqual({ maxMonths: 12 });
  });

  it('does not cut a term at 31 December: six months from the 15th of November end on the 14th of May (R-D03)', () => {
    expect(effectiveEndOf({ start: '2026-11-15', months: 6 })).toBe('2027-05-14');
    expect(effectiveEndOf({ start: '2026-11-05', months: 3 })).toBe('2027-02-04');
    expect(effectiveEndOf({ start: '2026-11-05', months: 1 })).toBe('2026-12-04');
  });
});

describe('the end of a renewal (QĐ-98, R-15, R-M2)', () => {
  it('begins the day after the right ends, or today when it has ended already', () => {
    expect(renewalStartOf({ previousEnd: '2026-11-30', today: '2026-11-20' })).toBe('2026-12-01');
    expect(renewalStartOf({ previousEnd: '2026-11-30', today: '2026-11-30' })).toBe('2026-12-01');
    expect(renewalStartOf({ previousEnd: '2026-11-03', today: '2026-11-05' })).toBe('2026-11-05');
  });

  it('runs the months asked from there, over the end of a month and a year', () => {
    expect(renewalEndOf({ previousEnd: '2026-01-30', today: '2026-01-10', months: 1 })).toBe('2026-02-27');
    expect(renewalEndOf({ previousEnd: '2026-12-31', today: '2026-12-01', months: 6 })).toBe('2027-06-30');
  });

  it('starts from today when the right has ended', () => {
    expect(renewalEndOf({ previousEnd: '2026-11-03', today: '2026-11-05', months: 3 })).toBe('2027-02-04');
  });

  it('is not cut at the end of the calendar year it begins in', () => {
    expect(renewalEndOf({ previousEnd: '2026-11-30', today: '2026-11-20', months: 6 })).toBe('2027-05-31');
    expect(renewalEndOf({ previousEnd: '2026-12-31', today: '2026-12-20', months: 12 })).toBe('2027-12-31');
  });
});

describe('the end of a seat once its grant is completed (BR-MF1-06a, QĐ-106b)', () => {
  it('S1-01: a request made on 10/11 and completed on 13/11 ends at the day it asked for, a year from the completion at the latest', () => {
    // Asked for the longest end on the day of sending: 09/11/2027, which is a year from 10/11/2026 less a day.
    expect(endAfterGrant({ expectedEndDate: '2027-11-09', grantedOn: '2026-11-13' })).toBe('2027-11-09');
    expect(endAfterGrant({ expectedEndDate: '2028-01-01', grantedOn: '2026-11-13' })).toBe('2027-11-12');
    expect(endAfterGrant({ expectedEndDate: '2027-11-12', grantedOn: '2026-11-13' })).toBe('2027-11-12');
  });

  it('keeps no end for a right that has none', () => {
    expect(endAfterGrant({ expectedEndDate: null, grantedOn: '2026-11-13' })).toBeNull();
  });
});

describe('the time of use a kind of grant asks for (QĐ-111i, FR-2.8)', () => {
  const asked = (
    kind: TermKind,
    termMonths: number | null | undefined,
    fixedTermPerson = false,
    contractEndKnown = false,
  ): ReturnType<typeof checkTermMonths> => checkTermMonths({ kind, termMonths, fixedTermPerson, contractEndKnown });

  it('K1 asks for 1 to 9 months and never takes a right with no end', () => {
    expect(asked('K1', 1)).toBeNull();
    expect(asked('K1', 9)).toBeNull();
    expect(asked('K1', 10)).toBe('TERM_MONTHS_OUT_OF_RANGE');
    expect(asked('K1', 0)).toBe('TERM_MONTHS_OUT_OF_RANGE');
    expect(asked('K1', undefined)).toBe('TERM_REQUIRED');
    expect(asked('K1', null)).toBe('TERM_REQUIRED');
  });

  it('K2 and K5 ask for 1 to 12 months, or null for a right that has no end (Dùng lâu dài)', () => {
    for (const kind of ['K2', 'K5'] as const) {
      expect(asked(kind, 12)).toBeNull();
      expect(asked(kind, 13)).toBe('TERM_MONTHS_OUT_OF_RANGE');
      expect(asked(kind, 0)).toBe('TERM_MONTHS_OUT_OF_RANGE');
      expect(asked(kind, null)).toBeNull();
      expect(asked(kind, undefined)).toBeNull();
    }
  });

  it('K4 is a purchase, so it asks nothing: a number is refused, null or nothing is the answer', () => {
    expect(asked('K4', 3)).toBe('TERM_NOT_ASKED');
    expect(asked('K4', null)).toBeNull();
    expect(asked('K4', undefined)).toBeNull();
  });

  it('a person with a term (contractor, freelancer, intern) gives the months and never takes Dùng lâu dài (INV-07)', () => {
    expect(asked('K2', null, true)).toBe('TERM_LONG_TERM_NOT_ALLOWED');
    expect(asked('K5', null, true)).toBe('TERM_LONG_TERM_NOT_ALLOWED');
    expect(asked('K2', undefined, true)).toBe('TERM_REQUIRED');
    expect(asked('K2', 6, true)).toBeNull();
    // K1 takes no right with no end for anybody: staff who say none are missing the months, a person with a term who says none is refused (T-R38).
    expect(asked('K1', null, true)).toBe('TERM_LONG_TERM_NOT_ALLOWED');
    expect(asked('K1', undefined, true)).toBe('TERM_REQUIRED');
    expect(asked('K1', null, false)).toBe('TERM_REQUIRED');
    expect(asked('K1', 6, true)).toBeNull();
  });

  it('INV-07: a plan bought once (K4) has no months, so a person with a term gets the key only up to the end of their contract, and none when it is not known', () => {
    expect(asked('K4', null, true, true)).toBeNull();
    expect(asked('K4', undefined, true, true)).toBeNull();
    expect(asked('K4', null, true, false)).toBe('TERM_LONG_TERM_NOT_ALLOWED');
    expect(asked('K4', 3, true, true)).toBe('TERM_NOT_ASKED');
    expect(asked('K4', null, false, false)).toBeNull();
  });

  it('QĐ-111l: a plan bought once is never renewed: a request to go on using asks no time of use of K4, for anyone, with or without months', () => {
    const renewed = (termMonths: number | null, fixedTermPerson: boolean, contractEndKnown: boolean) =>
      checkTermMonths({ kind: 'K4', termMonths, fixedTermPerson, contractEndKnown, renewing: true });

    expect(renewed(null, false, false)).toBe('TERM_NOT_ASKED');
    expect(renewed(3, false, false)).toBe('TERM_NOT_ASKED');
    expect(renewed(null, true, true)).toBe('TERM_NOT_ASKED');
    expect(renewed(3, true, true)).toBe('TERM_NOT_ASKED');
    // The other kinds are judged as for any request.
    expect(checkTermMonths({ kind: 'K2', termMonths: null, fixedTermPerson: false, renewing: true })).toBeNull();
    expect(checkTermMonths({ kind: 'K1', termMonths: 9, fixedTermPerson: false, renewing: true })).toBeNull();
  });
});

describe('the run of a term: the months that begin, the end, and the cut at the end of a contract (R-38, R-39)', () => {
  it('ends the day before the same day N months later, and counts one month for each month that begins', () => {
    expect(termRunOf({ start: '2026-11-15', months: 9, contractEndDate: null })).toEqual({
      start: '2026-11-15',
      months: 9,
      end: '2027-08-14',
      cutAt: null,
      startedMonths: 9,
    });
  });

  it('T-R38: an intern whose contract ends 31/01/2027, sent 10/11/2026 for 9 months, is cut to 31/01/2027 with 3 months begun', () => {
    expect(termRunOf({ start: '2026-11-10', months: 9, contractEndDate: '2027-01-31' })).toEqual({
      start: '2026-11-10',
      months: 9,
      end: '2027-01-31',
      cutAt: '2027-01-31',
      startedMonths: 3,
    });
  });

  it('counts a month that has begun even if the contract ends the day after it begins (10/01 begins, 11/01 ends)', () => {
    expect(termRunOf({ start: '2026-11-10', months: 9, contractEndDate: '2027-01-11' })).toMatchObject({
      end: '2027-01-11',
      startedMonths: 3,
    });
    expect(termRunOf({ start: '2026-11-10', months: 9, contractEndDate: '2027-01-09' })).toMatchObject({
      end: '2027-01-09',
      startedMonths: 2,
    });
  });

  it('does not cut a term that ends on the day of the contract or before it', () => {
    expect(termRunOf({ start: '2026-11-10', months: 3, contractEndDate: '2027-02-09' })).toMatchObject({
      end: '2027-02-09',
      cutAt: null,
      startedMonths: 3,
    });
    expect(termRunOf({ start: '2026-11-10', months: 3, contractEndDate: '2027-12-31' })).toMatchObject({
      end: '2027-02-09',
      cutAt: null,
    });
  });

  it('a contract that ends on the very last day the months would give does not cut: nothing is cut, the end is the same day', () => {
    expect(termRunOf({ start: '2026-11-10', months: 3, contractEndDate: '2027-02-09' })).toEqual({
      start: '2026-11-10',
      months: 3,
      end: '2027-02-09',
      cutAt: null,
      startedMonths: 3,
    });
    // One day before it does cut, to that day, and the months that have begun are still the same three.
    expect(termRunOf({ start: '2026-11-10', months: 3, contractEndDate: '2027-02-08' })).toMatchObject({
      end: '2027-02-08',
      cutAt: '2027-02-08',
      startedMonths: 3,
    });
  });

  it('a right that has no end has no cut and no count of months', () => {
    expect(termRunOf({ start: '2026-11-20', months: null, contractEndDate: null })).toEqual({
      start: '2026-11-20',
      months: null,
      end: null,
      cutAt: null,
      startedMonths: null,
    });
  });

  it('a contract already over still gives the day it starts: one month begun, never an end before the start', () => {
    expect(termRunOf({ start: '2026-11-10', months: 3, contractEndDate: '2026-10-31' })).toMatchObject({
      end: '2026-11-10',
      cutAt: '2026-11-10',
      startedMonths: 1,
    });
  });

  it('a month that begins on the 31st begins on the last day of a shorter month', () => {
    expect(termRunOf({ start: '2026-01-31', months: 3, contractEndDate: null })).toMatchObject({
      end: '2026-04-29',
      startedMonths: 3,
    });
  });
});

describe('the months that begin in a year (R-39, QĐ-111j: a month belongs to the year of the day it begins)', () => {
  it('T-RQ2: 9 months from 15/11/2026 are 2 in 2026 and 7 in 2027', () => {
    const facts = { start: '2026-11-15', end: '2027-08-14' };

    expect(monthsBeginningIn({ ...facts, year: 2026 })).toBe(2);
    expect(monthsBeginningIn({ ...facts, year: 2027 })).toBe(7);
    expect(monthsBeginningIn({ ...facts, year: 2028 })).toBe(0);
  });

  it('a right with no end begins a month each month for ever: from 20/11/2026 two months in 2026 and twelve in 2027', () => {
    const facts = { start: '2026-11-20', end: null };

    expect(monthsBeginningIn({ ...facts, year: 2026 })).toBe(2);
    expect(monthsBeginningIn({ ...facts, year: 2027 })).toBe(12);
  });

  it('a start on 31/12 is one month of the year and the others are of the next', () => {
    expect(monthsBeginningIn({ start: '2026-12-31', end: '2027-11-30', year: 2026 })).toBe(1);
    expect(monthsBeginningIn({ start: '2026-12-31', end: '2027-11-30', year: 2027 })).toBe(11);
  });

  it('a cut term stops at the end: 10/11/2026 to 31/01/2027 is 2 months in 2026 and 1 in 2027', () => {
    expect(monthsBeginningIn({ start: '2026-11-10', end: '2027-01-31', year: 2026 })).toBe(2);
    expect(monthsBeginningIn({ start: '2026-11-10', end: '2027-01-31', year: 2027 })).toBe(1);
  });
});
