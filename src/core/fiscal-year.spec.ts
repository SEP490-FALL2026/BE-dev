import { addMonths, fiscalYearOf } from './fiscal-year';

describe('the fiscal year of a day (QĐ-82e)', () => {
  it('is the calendar year when the fiscal year begins in January', () => {
    expect(fiscalYearOf('2027-01-05', 1)).toBe(2027);
    expect(fiscalYearOf('2026-12-31', 1)).toBe(2026);
  });

  it('is named after the calendar year it begins in, and a day before the first month belongs to the year before', () => {
    expect(fiscalYearOf('2026-04-01', 4)).toBe(2026);
    expect(fiscalYearOf('2027-03-31', 4)).toBe(2026);
    expect(fiscalYearOf('2027-04-01', 4)).toBe(2027);
  });

  it('puts the 20th of December and the 5th of January in two years when the year begins in January', () => {
    expect(fiscalYearOf('2026-12-20', 1)).not.toBe(fiscalYearOf('2027-01-05', 1));
  });

  it('refuses a month that is not one of the twelve', () => {
    expect(() => fiscalYearOf('2026-04-01', 0)).toThrow();
    expect(() => fiscalYearOf('2026-04-01', 13)).toThrow();
  });
});

describe('adding months to a day', () => {
  it('keeps the day of the month', () => {
    expect(addMonths('2026-10-15', 1)).toBe('2026-11-15');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-10-15', 12)).toBe('2027-10-15');
  });

  it('falls on the last day of a month that is shorter, never on the next month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2027-12-31', 2)).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });
});
