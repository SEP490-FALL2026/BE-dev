import {
  checkTerm,
  effectiveEndOf,
  endAfterGrant,
  renewalEndOf,
  renewalStartOf,
  termEndOf,
  termLimitOf,
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
