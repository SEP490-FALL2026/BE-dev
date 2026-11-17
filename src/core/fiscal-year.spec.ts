import type { BusinessDate } from './business-date';
import { addMonths, fiscalYearOf, firstGridOffsetFrom } from './fiscal-year';

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

describe('the first day of a monthly grid that is not before a day (R-1)', () => {
  const dayOf = (anchor: BusinessDate, step: number, from: BusinessDate) =>
    addMonths(anchor, firstGridOffsetFrom(anchor, step, from) * step);

  it('is the anchor itself while it has not passed, and the nearest day before it that is not before `from` when it is months ahead', () => {
    expect(dayOf('2026-12-15', 1, '2026-12-15')).toBe('2026-12-15');
    expect(dayOf('2026-12-31', 1, '2026-11-17')).toBe('2026-11-30');
    expect(dayOf('2026-12-31', 1, '2026-02-01')).toBe('2026-02-28');
  });

  it('rolls forward when the anchor has passed, a shorter month ending on its last day without moving the day of the next', () => {
    expect(dayOf('2026-01-31', 1, '2026-02-10')).toBe('2026-02-28');
    expect(dayOf('2026-01-31', 1, '2026-03-01')).toBe('2026-03-31');
    expect(dayOf('2026-01-15', 1, '2027-03-02')).toBe('2027-03-15');
  });

  it('steps by the months of the cycle', () => {
    expect(dayOf('2026-12-15', 3, '2026-11-01')).toBe('2026-12-15');
    expect(dayOf('2026-12-15', 3, '2026-12-16')).toBe('2027-03-15');
    expect(dayOf('2026-12-15', 12, '2026-01-01')).toBe('2026-12-15');
    expect(dayOf('2026-12-15', 12, '2025-12-16')).toBe('2026-12-15');
  });
});
