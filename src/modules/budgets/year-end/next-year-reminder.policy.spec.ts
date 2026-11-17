import { nextYearReminderOn } from './next-year-reminder.policy';

describe('B-4, QĐ-111am: the days the budget of the year after is asked for (01/12, then every Monday until a version is approved)', () => {
  it.each([
    ['01/12/2026, a Tuesday: the first day', '2026-12-01', 2027],
    ['07/12/2026, the first Monday after', '2026-12-07', 2027],
    ['14/12/2026, a Monday', '2026-12-14', 2027],
    ['21/12/2026, a Monday', '2026-12-21', 2027],
    ['28/12/2026, the last Monday', '2026-12-28', 2027],
    ['01/12/2025, a Monday: the first day is also a Monday, one reminder', '2025-12-01', 2026],
  ])('tells on %s, for the year %i (the year after)', (_label, today, year) => {
    expect(nextYearReminderOn(today)).toEqual({ year });
  });

  it.each([
    ['04/01/2027, the first Monday of the year that was asked for: it is the year that runs now', '2027-01-04', 2027],
    ['11/01/2027, the next Monday', '2027-01-11', 2027],
    ['01/03/2027, a Monday in March', '2027-03-01', 2027],
    ['30/11/2026, the Monday before 01/12: the year that runs', '2026-11-30', 2026],
    ['01/01/2024, a Monday that is also 01/01', '2024-01-01', 2024],
  ])(
    'goes on telling on %s, for the year %i that runs: no end at 01/01, only the approval of a version',
    (_label, today, year) => {
      expect(nextYearReminderOn(today)).toEqual({ year });
    },
  );

  it.each([
    ['02/12/2026, a Wednesday', '2026-12-02'],
    ['06/12/2026, a Sunday', '2026-12-06'],
    ['08/12/2026, a Tuesday', '2026-12-08'],
    ['31/12/2026, a Thursday', '2026-12-31'],
    ['01/01/2027, a Friday: 01/01 is no day of its own, only the Mondays', '2027-01-01'],
    ['05/01/2027, a Tuesday', '2027-01-05'],
    ['24/11/2026, a Tuesday in November', '2026-11-24'],
    ['29/11/2026, a Sunday', '2026-11-29'],
  ])('does not tell on %s', (_label, today) => {
    expect(nextYearReminderOn(today)).toBeNull();
  });
});
