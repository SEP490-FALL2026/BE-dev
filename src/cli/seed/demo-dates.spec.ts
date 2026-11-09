import { addMonths, dayBeforeNewYear, dayOffset, daysBetween, endOfMonth } from './demo-dates';

/** The days of the dataset are all counted from today: the same states come out whatever day the seed runs on. */
describe('the relative days of the demo dataset', () => {
  it.each([
    ['2026-03-15', 20, '2026-04-04'],
    ['2026-12-20', 20, '2027-01-09'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-01', -130, '2025-08-24'],
  ])('%s + %i days is %s', (day, days, expected) => {
    expect(dayOffset(day, days)).toBe(expected);
  });

  it.each([
    ['2026-03-15', '2026-03-31'],
    ['2026-12-31', '2026-12-31'],
    ['2026-02-10', '2026-02-28'],
    ['2028-02-10', '2028-02-29'],
  ])('the end of the month of %s is %s', (day, expected) => {
    expect(endOfMonth(day)).toBe(expected);
  });

  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2026-12-30', -12, '2025-12-30'],
    ['2026-11-10', 3, '2027-02-10'],
  ])('%s + %i months is %s, clamped to the last day of the month', (day, months, expected) => {
    expect(addMonths(day, months)).toBe(expected);
  });

  it('counts whole days between two days and the days before the first of January', () => {
    expect(daysBetween('2026-11-10', '2026-12-30')).toBe(50);
    expect(dayBeforeNewYear(2027, 60)).toBe('2026-11-02');
    expect(dayBeforeNewYear(2027, 30)).toBe('2026-12-02');
  });
});
