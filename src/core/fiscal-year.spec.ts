import { addMonths, fiscalYearOf } from './fiscal-year';

describe('the fiscal year of a day (QĐ-104e(1), R-I01)', () => {
  it('is the calendar year', () => {
    expect(fiscalYearOf('2026-03-31')).toBe(2026);
    expect(fiscalYearOf('2026-01-01')).toBe(2026);
  });

  it('puts the 31st of December and the 1st of January in two years', () => {
    expect(fiscalYearOf('2026-12-31')).toBe(2026);
    expect(fiscalYearOf('2027-01-01')).toBe(2027);
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
