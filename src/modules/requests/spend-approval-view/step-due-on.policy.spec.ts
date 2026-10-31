import { calendarWindowOf, dueOnOf } from './step-due-on.policy';

const ZONE = 'Asia/Ho_Chi_Minh';
// Thursday 1 October 2026, 09:00 in the zone.
const thursday = new Date('2026-10-01T02:00:00Z');

describe('the day a step is due', () => {
  it('counts the working days after the day it began, over the weekend', () => {
    expect(dueOnOf({ createdAt: thursday, slaWorkingDays: 2 }, new Set(), ZONE)).toBe('2026-10-05');
  });

  it('skips a day nobody works', () => {
    expect(dueOnOf({ createdAt: thursday, slaWorkingDays: 2 }, new Set(['2026-10-05']), ZONE)).toBe('2026-10-06');
  });

  it('reads the day of the began in the zone of the organization, not in UTC', () => {
    // 20:00 UTC on Thursday is already Friday morning in Ho Chi Minh: one working day later is Monday.
    expect(dueOnOf({ createdAt: new Date('2026-10-01T20:00:00Z'), slaWorkingDays: 1 }, new Set(), ZONE)).toBe(
      '2026-10-05',
    );
  });
});

describe('the days of the calendar to read for a page of steps', () => {
  it('reads nothing for an empty page', () => {
    expect(calendarWindowOf([], ZONE)).toBeNull();
  });

  it('runs from the day the oldest began to past the latest deadline, whatever the order of the steps', () => {
    const window = calendarWindowOf(
      [
        { createdAt: new Date('2026-10-12T02:00:00Z'), slaWorkingDays: 2 },
        { createdAt: thursday, slaWorkingDays: 5 },
      ],
      ZONE,
    );

    expect(window).toEqual({ from: '2026-10-01', to: '2026-11-17' });
  });
});
