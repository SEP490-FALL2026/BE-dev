import {
  checkTerm,
  effectiveEndOf,
  fiscalYearEndOf,
  renewalEndOf,
  renewalStartOf,
  termEndOf,
  termLimitOf,
} from './term-limit';

describe('the term a request may ask for (US-05-01 AC-4, QĐ-98)', () => {
  it('ends a fiscal year the day before the next one begins, for a year that begins in January or in April', () => {
    expect(fiscalYearEndOf('2026-11-05', 1)).toBe('2026-12-31');
    expect(fiscalYearEndOf('2027-02-10', 4)).toBe('2027-03-31');
    expect(fiscalYearEndOf('2027-04-01', 4)).toBe('2028-03-31');
  });

  it('gives a year and no end day for a plan that is not flexible, and the end of the fiscal year for one that is', () => {
    expect(termLimitOf({ start: '2026-11-05', flexible: false, fiscalYearStartMonth: 1 })).toEqual({
      maxMonths: 12,
      endsBy: null,
    });
    expect(termLimitOf({ start: '2026-11-05', flexible: true, fiscalYearStartMonth: 1 })).toEqual({
      maxMonths: 12,
      endsBy: '2026-12-31',
    });
  });

  it('ends a term the day before the same day months later', () => {
    expect(termEndOf('2026-11-05', 1)).toBe('2026-12-04');
    expect(termEndOf('2026-01-31', 1)).toBe('2026-02-27');
  });

  it('allows twelve months and refuses thirteen on a plan that is not flexible', () => {
    const base = { start: '2026-11-05', flexible: false, fiscalYearStartMonth: 1 };

    expect(checkTerm({ ...base, months: 12 })).toBeNull();
    expect(checkTerm({ ...base, months: 13 })).toEqual({ maxMonths: 12, endsBy: null });
  });

  it('does not refuse a flexible plan that runs past the end of the fiscal year: only more than a year is refused', () => {
    const base = { start: '2026-11-05', flexible: true, fiscalYearStartMonth: 1 };

    expect(checkTerm({ ...base, months: 2 })).toBeNull();
    expect(checkTerm({ ...base, months: 12 })).toBeNull();
    expect(checkTerm({ ...base, months: 13 })).toEqual({ maxMonths: 12, endsBy: '2026-12-31' });
  });

  it('cuts the end of a flexible plan at the end of the fiscal year, and leaves any other plan to run its term', () => {
    const base = { start: '2026-11-05', months: 3, fiscalYearStartMonth: 1 };

    expect(effectiveEndOf({ ...base, flexible: true })).toBe('2026-12-31');
    expect(effectiveEndOf({ ...base, flexible: false })).toBe('2027-02-04');
    expect(effectiveEndOf({ ...base, months: 1, flexible: true })).toBe('2026-12-04');
    expect(effectiveEndOf({ start: '2026-04-01', months: 12, flexible: true, fiscalYearStartMonth: 4 })).toBe(
      '2027-03-31',
    );
  });
});

describe('the end of a renewal (QĐ-98, R-15, R-M2)', () => {
  const base = { fiscalYearStartMonth: 1, flexible: false };

  it('begins the day after the right ends, or today when it has ended already', () => {
    expect(renewalStartOf({ previousEnd: '2026-11-30', today: '2026-11-20' })).toBe('2026-12-01');
    expect(renewalStartOf({ previousEnd: '2026-11-30', today: '2026-11-30' })).toBe('2026-12-01');
    expect(renewalStartOf({ previousEnd: '2026-11-03', today: '2026-11-05' })).toBe('2026-11-05');
  });

  it('runs the months asked from there, over the end of a month and a year', () => {
    expect(renewalEndOf({ ...base, previousEnd: '2026-01-30', today: '2026-01-10', months: 1 })).toBe('2026-02-27');
    expect(renewalEndOf({ ...base, previousEnd: '2026-12-31', today: '2026-12-01', months: 6 })).toBe('2027-06-30');
  });

  it('starts from today when the right has ended', () => {
    expect(renewalEndOf({ ...base, previousEnd: '2026-11-03', today: '2026-11-05', months: 3 })).toBe('2027-02-04');
  });

  it('cuts a flexible subscription at the end of the fiscal year the renewal begins in, and leaves a fixed one to run', () => {
    const facts = { previousEnd: '2026-11-30', today: '2026-11-20', months: 6, fiscalYearStartMonth: 1 };

    expect(renewalEndOf({ ...facts, flexible: true })).toBe('2026-12-31');
    expect(renewalEndOf({ ...facts, flexible: false })).toBe('2027-05-31');
    // Renewed from the first day of a new fiscal year, the cut is the end of that year, not of the one that ended.
    expect(renewalEndOf({ ...facts, previousEnd: '2026-12-31', today: '2026-12-20', months: 12, flexible: true })).toBe(
      '2027-12-31',
    );
  });
});
