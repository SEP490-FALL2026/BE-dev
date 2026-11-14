import { nextYearReminderOn } from './next-year-reminder.policy';

describe('B-4, QĐ-111am: the days the budget of the year after is asked for (01/12, then every Monday)', () => {
  it.each([
    ['01/12/2026, a Tuesday: the first day', '2026-12-01', 2027],
    ['07/12/2026, the first Monday after', '2026-12-07', 2027],
    ['14/12/2026, a Monday', '2026-12-14', 2027],
    ['21/12/2026, a Monday', '2026-12-21', 2027],
    ['28/12/2026, the last Monday', '2026-12-28', 2027],
    ['01/12/2025, a Monday: the first day is also a Monday, one reminder', '2025-12-01', 2026],
  ])('tells on %s, for the year %i', (_label, today, year) => {
    expect(nextYearReminderOn(today)).toEqual({ year });
  });

  it.each([
    ['30/11/2026, the day before', '2026-11-30'],
    ['02/12/2026, a Wednesday', '2026-12-02'],
    ['06/12/2026, a Sunday', '2026-12-06'],
    ['08/12/2026, a Tuesday', '2026-12-08'],
    ['31/12/2026, a Thursday', '2026-12-31'],
    ['04/01/2027, a Monday of the new year: it is the budget of 2027 that runs now', '2027-01-04'],
    ['01/06/2026, a Monday in June', '2026-06-01'],
    ['30/11/2026, a Monday in November', '2026-11-30'],
  ])('does not tell on %s', (_label, today) => {
    expect(nextYearReminderOn(today)).toBeNull();
  });
});
