import { addDays } from '../../../core/business-date';
import {
  deadlineWindowEnd,
  isRevocationOverdue,
  overdueNoticeOwed,
  revocationDueOn,
  rightsWithoutCompletedTask,
} from './departure-deadline.policy';

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

describe('the rights a departure has not taken away yet', () => {
  it('counts every seat that has no task completed, whether or not a task works on it', () => {
    expect(
      rightsWithoutCompletedTask([
        { revocation: null },
        { revocation: { status: 'QUEUED' } },
        { revocation: { status: 'IN_PROGRESS' } },
        { revocation: { status: 'FAILED' } },
        { revocation: { status: 'RETRY_SCHEDULED' } },
        { revocation: { status: 'COMPLETED' } },
      ]),
    ).toBe(5);
  });

  it('is zero when every seat has a completed task, or the person holds none', () => {
    expect(rightsWithoutCompletedTask([{ revocation: { status: 'COMPLETED' } }])).toBe(0);
    expect(rightsWithoutCompletedTask([])).toBe(0);
  });
});

describe('a departure whose rights are still not taken away past the day (QĐ-110c, T-MF2)', () => {
  const open = { state: 'LEFT', closed: false, dueOn: '2026-10-01', rightsWithoutCompletedTask: 2 } as const;

  it.each([
    ['on the day itself it is not late', '2026-10-01', false],
    ['Friday 02/10, the day after the deadline, it is late', '2026-10-02', true],
    ['Monday 05/10 it is late', '2026-10-05', true],
  ])('%s', (_name, today, late) => {
    expect(isRevocationOverdue(open, today)).toBe(late);
  });

  it.each([
    ['not before the deadline', { ...open, rightsWithoutCompletedTask: 2 }, '2026-10-01', false],
    [
      'not when no right is left without a completed task',
      { ...open, rightsWithoutCompletedTask: 0 },
      '2026-10-02',
      false,
    ],
    [
      'not for a case that has no deadline (closed or cancelled before the rule)',
      { ...open, dueOn: null },
      '2026-10-02',
      false,
    ],
    ['not for a cancelled case', { ...open, state: 'CANCELLED' }, '2026-10-02', false],
    ['not for a closed case', { ...open, closed: true }, '2026-10-02', false],
    ['for a handover under way that the block already reached', { ...open, state: 'HANDING_OVER' }, '2026-10-02', true],
  ] as const)('is late %s', (_name, standing, today, late) => {
    expect(isRevocationOverdue(standing, today)).toBe(late);
  });

  it('is told on a working day only: Friday 02/10 and Monday 05/10 yes, the weekend no, a day off no', () => {
    const owed = (today: string, off: ReadonlySet<string> = NONE) => overdueNoticeOwed(open, today, off);

    expect(owed('2026-10-02')).toBe(true);
    expect(owed('2026-10-03')).toBe(false);
    expect(owed('2026-10-04')).toBe(false);
    expect(owed('2026-10-05')).toBe(true);
    expect(owed('2026-10-05', new Set(['2026-10-05']))).toBe(false);
    expect(owed('2026-10-06', new Set(['2026-10-05']))).toBe(true);
    expect(owed('2026-10-01')).toBe(false);
  });
});
