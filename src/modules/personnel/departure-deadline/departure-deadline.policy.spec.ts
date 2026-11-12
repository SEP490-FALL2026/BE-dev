import { addDays } from '../../../core/business-date';
import { deadlineWindowEnd, revocationDueOn } from './departure-deadline.policy';

const NONE: ReadonlySet<string> = new Set();

describe('the day the IT Admin has until to take every right away (QĐ-110c, T-MF2)', () => {
  it.each([
    [
      'planned: last day Wednesday 30/09, the first working day after is Thursday 01/10',
      '2026-09-30',
      1,
      NONE,
      '2026-10-01',
    ],
    ['blocked now on Thursday 12/11: last day 12/11, due Friday 13/11', '2026-11-12', 1, NONE, '2026-11-13'],
    ['last day on a Friday: the weekend does not count, due Monday', '2026-11-13', 1, NONE, '2026-11-16'],
    ['two working days: Wednesday 30/09 gives Friday 02/10', '2026-09-30', 2, NONE, '2026-10-02'],
    ['two working days over a weekend: Thursday 12/11 gives Monday 16/11', '2026-11-12', 2, NONE, '2026-11-16'],
    ['a day off right after the last day is skipped', '2026-09-30', 1, new Set(['2026-10-01']), '2026-10-02'],
    [
      'a day off on the Friday after a Thursday last day leaves the Monday',
      '2026-11-12',
      1,
      new Set(['2026-11-13']),
      '2026-11-16',
    ],
    [
      'two working days with a day off between them: the day off is not counted',
      '2026-09-30',
      2,
      new Set(['2026-10-02']),
      '2026-10-05',
    ],
  ])('%s', (_name, lastWorkingDay, days, nonWorking, expected) => {
    expect(revocationDueOn(lastWorkingDay, days, nonWorking)).toBe(expected);
  });

  it('asks for a window of days off that holds the working days of the deadline', () => {
    expect(deadlineWindowEnd('2026-11-12')).toBe(addDays('2026-11-13', 90));
  });
});
