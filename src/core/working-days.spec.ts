import {
  addWorkingDays,
  instantAtWallClock,
  isWorkingDay,
  nthWorkingDayFrom,
  slaDueAt,
  subtractWorkingDays,
  wallClockAt,
  workingDaysBetween,
} from './working-days';

const HCM = 'Asia/Ho_Chi_Minh';
const NONE: ReadonlySet<string> = new Set();
// 2026-10-23 is a Friday; 2026-10-24 and 2026-10-25 are the weekend.
const FRIDAY = '2026-10-23';

describe('working days', () => {
  describe('isWorkingDay', () => {
    it.each([
      ['a Friday', '2026-10-23', true],
      ['a Saturday', '2026-10-24', false],
      ['a Sunday', '2026-10-25', false],
      ['a Monday', '2026-10-26', true],
    ])('%s', (_name, date, expected) => {
      expect(isWorkingDay(date, NONE)).toBe(expected);
    });

    it('is false on a day the organization does not work, and true again the day after', () => {
      const holidays = new Set(['2026-10-26']);

      expect(isWorkingDay('2026-10-26', holidays)).toBe(false);
      expect(isWorkingDay('2026-10-27', holidays)).toBe(true);
    });
  });

  describe('nthWorkingDayFrom', () => {
    it.each([
      ['day 5 from a Monday is the Friday of the week', '2026-07-06', 5, '2026-07-10'],
      ['day 3 from a Monday is the Wednesday', '2026-07-06', 3, '2026-07-08'],
      ['day 1 is the start itself when it is a working day', '2026-07-06', 1, '2026-07-06'],
      ['a Saturday is not day 1: the Monday after is, so day 5 is the Friday', '2026-07-04', 5, '2026-07-10'],
      ['a Sunday start counts like a Saturday one', '2026-07-05', 1, '2026-07-06'],
    ])('%s', (_name, start, n, expected) => {
      expect(nthWorkingDayFrom(start, n, NONE)).toBe(expected);
    });

    it('steps over a day off inside the count and a day off the start falls on', () => {
      expect(nthWorkingDayFrom('2026-07-06', 3, new Set(['2026-07-07']))).toBe('2026-07-09');
      expect(nthWorkingDayFrom('2026-07-06', 1, new Set(['2026-07-06']))).toBe('2026-07-07');
    });

    it('refuses a count below one: there is no day 0', () => {
      expect(() => nthWorkingDayFrom('2026-07-06', 0, NONE)).toThrow(RangeError);
    });
  });

  describe('addWorkingDays', () => {
    it('does not move for zero days', () => {
      expect(addWorkingDays(FRIDAY, 0, NONE)).toBe(FRIDAY);
    });

    it('steps over the weekend: two days after a Friday is the Tuesday', () => {
      expect(addWorkingDays(FRIDAY, 2, NONE)).toBe('2026-10-27');
    });

    it('does not count the day it starts from, even when that is a Saturday', () => {
      expect(addWorkingDays('2026-10-24', 1, NONE)).toBe('2026-10-26');
      expect(addWorkingDays('2026-10-24', 2, NONE)).toBe('2026-10-27');
    });

    it('steps over a day off next to the weekend', () => {
      expect(addWorkingDays(FRIDAY, 1, new Set(['2026-10-26']))).toBe('2026-10-27');
    });

    it('steps over a run of days off', () => {
      const holidays = new Set(['2026-10-26', '2026-10-27', '2026-10-28']);

      expect(addWorkingDays(FRIDAY, 1, holidays)).toBe('2026-10-29');
    });

    it('goes back with a negative count, and subtractWorkingDays is its mirror', () => {
      expect(addWorkingDays('2026-10-27', -2, NONE)).toBe(FRIDAY);
      expect(subtractWorkingDays('2026-10-27', 2, NONE)).toBe(FRIDAY);
      expect(subtractWorkingDays('2026-10-26', 1, new Set([FRIDAY]))).toBe('2026-10-22');
    });

    it('crosses a month and a year', () => {
      expect(addWorkingDays('2026-12-31', 1, new Set(['2027-01-01']))).toBe('2027-01-04');
    });
  });

  describe('workingDaysBetween', () => {
    it('is zero for the same day and for a day before', () => {
      expect(workingDaysBetween(FRIDAY, FRIDAY, NONE)).toBe(0);
      expect(workingDaysBetween('2026-10-27', FRIDAY, NONE)).toBe(0);
    });

    it('counts the days after the start up to and including the end', () => {
      expect(workingDaysBetween('2026-10-20', '2026-10-23', NONE)).toBe(3);
    });

    it('leaves out the weekend', () => {
      expect(workingDaysBetween(FRIDAY, '2026-10-26', NONE)).toBe(1);
      expect(workingDaysBetween(FRIDAY, '2026-10-27', NONE)).toBe(2);
    });

    it('leaves out a day off, and counts the age of something made on a Saturday from the Monday', () => {
      expect(workingDaysBetween(FRIDAY, '2026-10-27', new Set(['2026-10-26']))).toBe(1);
      expect(workingDaysBetween('2026-10-24', '2026-10-26', NONE)).toBe(1);
    });

    it('agrees with addWorkingDays', () => {
      const holidays = new Set(['2026-10-26', '2026-11-02']);
      for (let count = 0; count <= 12; count += 1) {
        const due = addWorkingDays(FRIDAY, count, holidays);
        expect(workingDaysBetween(FRIDAY, due, holidays)).toBe(count);
      }
    });
  });

  describe('wall clock and instants', () => {
    it('reads the local date and time of an instant', () => {
      expect(wallClockAt(new Date('2026-10-23T09:00:00.250Z'), HCM)).toEqual({
        date: FRIDAY,
        msOfDay: 16 * 3_600_000 + 250,
      });
    });

    it('reads the next local day for an evening in UTC', () => {
      expect(wallClockAt(new Date('2026-10-23T18:30:00.000Z'), HCM)).toEqual({
        date: '2026-10-24',
        msOfDay: 90 * 60_000,
      });
    });

    it('turns a wall clock back into the same instant', () => {
      const instant = new Date('2026-10-23T09:12:34.567Z');

      expect(instantAtWallClock(wallClockAt(instant, HCM), HCM).toISOString()).toBe(instant.toISOString());
    });

    it('turns a wall clock back into the same instant across a change of the clocks', () => {
      const instant = new Date('2026-03-08T07:30:00.000Z');

      expect(instantAtWallClock(wallClockAt(instant, 'America/New_York'), 'America/New_York').toISOString()).toBe(
        instant.toISOString(),
      );
    });
  });

  describe('slaDueAt', () => {
    it('is the same time of day on the working day SLA days later: made at 16:00 on a Friday with two days, due 16:00 on the Tuesday', () => {
      const created = new Date('2026-10-23T09:00:00.000Z');

      expect(slaDueAt(created, 2, NONE, HCM).toISOString()).toBe('2026-10-27T09:00:00.000Z');
    });

    it('is not yet due at 09:00 on the Monday and 15:59 on the Tuesday, and is due at 16:01 on the Tuesday', () => {
      const created = new Date('2026-10-23T09:00:00.000Z');
      const due = slaDueAt(created, 2, NONE, HCM);

      expect(new Date('2026-10-26T02:00:00.000Z') > due).toBe(false);
      expect(new Date('2026-10-27T08:59:00.000Z') > due).toBe(false);
      expect(new Date('2026-10-27T09:01:00.000Z') > due).toBe(true);
    });

    it('moves a day when the Monday is a day off', () => {
      const created = new Date('2026-10-23T09:00:00.000Z');

      expect(slaDueAt(created, 2, new Set(['2026-10-26']), HCM).toISOString()).toBe('2026-10-28T09:00:00.000Z');
    });

    it('counts a step made on a Saturday from the Monday', () => {
      const created = new Date('2026-10-24T03:00:00.000Z');

      expect(slaDueAt(created, 2, NONE, HCM).toISOString()).toBe('2026-10-27T03:00:00.000Z');
    });

    it('takes a day off added after the step was made into account, because the calendar is read at the time of the question', () => {
      const created = new Date('2026-10-20T09:00:00.000Z');

      expect(slaDueAt(created, 2, NONE, HCM).toISOString()).toBe('2026-10-22T09:00:00.000Z');
      expect(slaDueAt(created, 2, new Set(['2026-10-21']), HCM).toISOString()).toBe('2026-10-23T09:00:00.000Z');
    });

    it('keeps the wall clock across the start of daylight saving time (America/New_York, 16:00 local)', () => {
      // Friday 6 March 2026 16:00 EST (UTC-5); the clocks go forward on Sunday 8 March; Tuesday 10 March 16:00 is EDT (UTC-4).
      const created = new Date('2026-03-06T21:00:00.000Z');
      const due = slaDueAt(created, 2, NONE, 'America/New_York');

      expect(due.toISOString()).toBe('2026-03-10T20:00:00.000Z');
      expect(wallClockAt(due, 'America/New_York').msOfDay).toBe(16 * 3_600_000);
    });
  });
});
