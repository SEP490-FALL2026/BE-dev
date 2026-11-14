import type { BusinessDate } from '../../../core/business-date';
import {
  CALENDAR_WORKING_DAYS,
  calendarLookAheadEnd,
  calendarWindowOf,
  type NonWorkingDates,
} from './departure-calendar.policy';

const none: NonWorkingDates = new Set<BusinessDate>();

describe('calendarWindowOf (the calendar of the next 10 working days, QĐ-110 G2, R5 E2)', () => {
  it('counts ten working days and no more', () => {
    expect(CALENDAR_WORKING_DAYS).toBe(10);
  });

  // 2026-11-16 is a Monday (the example of the transfer in SPEC T-MF3).
  it.each<[string, BusinessDate, BusinessDate, ReadonlySet<BusinessDate>]>([
    ['Monday: the tenth working day after it is the Monday two weeks on', '2026-11-16', '2026-11-30', none],
    ['Friday: ten working days are the Friday two weeks on', '2026-11-13', '2026-11-27', none],
    ['Saturday: the weekend is not a working day, so it ends on the same Friday', '2026-11-14', '2026-11-27', none],
    ['Sunday: the same Friday', '2026-11-15', '2026-11-27', none],
    ['a day off in the middle moves the end one working day on', '2026-11-13', '2026-11-30', new Set(['2026-11-18'])],
    [
      'a week of days off (the New Year of the calendar) moves the end past it',
      '2026-02-11',
      '2026-03-04',
      new Set(['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20']),
    ],
  ])('%s', (_name, today, to, nonWorking) => {
    expect(calendarWindowOf(today, nonWorking)).toEqual({ from: today, to });
  });

  it('takes the day it begins on as the first day of the window (a person leaving today is in it)', () => {
    const window = calendarWindowOf('2026-11-16', none);

    expect(window.from <= '2026-11-16' && '2026-11-16' <= window.to).toBe(true);
  });

  it('says how far ahead the days off must be read: always covers ten working days with the longest break', () => {
    // 10 working days + the 9 days of the New Year + two weekends fit in 45 calendar days.
    expect(calendarLookAheadEnd('2026-02-11')).toBe('2026-03-28');
  });
});
