import type { BusinessDate } from '../../../core/business-date';
import {
  explanationDueOn,
  explanationReminderDay,
  initialExplanationStatus,
  statusWhenSigned,
} from './budget-review-explanation.policy';

const day = (value: string): BusinessDate => value;
const NONE = new Set<BusinessDate>();

describe('who is asked to explain (RV-3, QĐ-111ah)', () => {
  it('only a yellow, red or under Cost Center of a quarter is asked; green and every month are not', () => {
    expect(initialExplanationStatus('QUARTER', 'YELLOW')).toBe('PENDING');
    expect(initialExplanationStatus('QUARTER', 'RED')).toBe('PENDING');
    expect(initialExplanationStatus('QUARTER', 'UNDER')).toBe('PENDING');
    expect(initialExplanationStatus('QUARTER', 'GREEN')).toBe('NOT_REQUIRED');
    expect(initialExplanationStatus('MONTH', 'RED')).toBe('NOT_REQUIRED');
  });

  it('a line left unanswered is UNEXPLAINED when the department has a head and NO_HEAD when it has none (R-10, R-17)', () => {
    expect(statusWhenSigned(true)).toBe('UNEXPLAINED');
    expect(statusWhenSigned(false)).toBe('NO_HEAD');
  });
});

describe('the day the explanation is due (R-47): the fifth working day from the close, the day of the close the first', () => {
  it('a quarter closed on Monday 05/10/2026 is due Friday 09/10/2026', () => {
    expect(explanationDueOn(day('2026-10-05'), NONE)).toBe('2026-10-09');
  });

  it('weekends and non-working days do not count: closed Thursday 08/10/2026 is due Wednesday 14/10/2026, and with 12/10 a holiday Thursday 15/10/2026', () => {
    expect(explanationDueOn(day('2026-10-08'), NONE)).toBe('2026-10-14');
    expect(explanationDueOn(day('2026-10-08'), new Set([day('2026-10-12')]))).toBe('2026-10-15');
  });
});

describe('the reminder (B-7): on the due day, then every Monday, until the head explains or Finance signs', () => {
  const due = day('2026-11-19');

  it('due on Thursday 19/11: reminded on Thursday 19/11 and on Monday 23/11, and on Monday 30/11, on no other day', () => {
    const days = [
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
      '2026-11-29',
      '2026-11-30',
    ];

    expect(days.filter((value) => explanationReminderDay(day(value), due))).toEqual([
      '2026-11-19',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('a Monday before the due day is not reminded', () => {
    expect(explanationReminderDay(day('2026-11-16'), due)).toBe(false);
  });

  it('a due day that is itself a Monday is reminded once (the day is the due day and a Monday)', () => {
    expect(explanationReminderDay(day('2026-11-23'), day('2026-11-23'))).toBe(true);
    expect(explanationReminderDay(day('2026-11-30'), day('2026-11-23'))).toBe(true);
  });
});
