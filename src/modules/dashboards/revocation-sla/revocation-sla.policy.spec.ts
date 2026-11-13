import type { BusinessDate } from '../../../core/business-date';
import {
  medianOf,
  outcomeOf,
  rowsOf,
  summaryOf,
  transferReRequestsOf,
  type SlaTask,
  type SlaUnit,
} from './revocation-sla.policy';

const none = new Set<BusinessDate>();
const noLate = new Set<string>();

// 2026-11-13 is a Friday (the departure blocked now on Thursday 12/11 of SPEC T-MF2 is due on Friday 13/11).
const unit = (startOn: BusinessDate, dueOn: BusinessDate, over: Partial<SlaUnit> = {}): SlaUnit => ({
  source: 'OFFBOARDING',
  id: 'case-1',
  departmentId: 'd-des',
  startOn,
  dueOn,
  ...over,
});
const done = (completedOn: BusinessDate, responsible: string | null = 'it-1'): SlaTask => ({
  status: 'COMPLETED',
  completedOn,
  responsibleEmployeeId: responsible,
});
const open = (status: SlaTask['status'] = 'QUEUED', responsible: string | null = 'it-1'): SlaTask => ({
  status,
  completedOn: null,
  responsibleEmployeeId: responsible,
});

describe('outcomeOf: on time is done by the end of the first working day after the block (RD.2, QĐ-110c, R5 E3)', () => {
  // The window opens the day after the last working day; the deadline is the first working day of it.
  it.each<[string, BusinessDate, BusinessDate, BusinessDate, boolean, number]>([
    ['the first working day itself', '2026-11-13', '2026-11-13', '2026-11-13', true, 1],
    ['a day late on a working day', '2026-11-13', '2026-11-13', '2026-11-16', false, 2],
    ['the window opens on a Saturday: the Monday is the deadline', '2026-11-14', '2026-11-16', '2026-11-16', true, 1],
    ['the window opens on a Saturday: Tuesday is late', '2026-11-14', '2026-11-16', '2026-11-17', false, 2],
    ['done before the window opens counts no day', '2026-11-16', '2026-11-16', '2026-11-13', true, 0],
    [
      'a Friday window done on the Monday after is two working days',
      '2026-11-13',
      '2026-11-13',
      '2026-11-16',
      false,
      2,
    ],
  ])('%s', (_name, startOn, dueOn, completedOn, onTime, workingDays) => {
    const result = outcomeOf(unit(startOn, dueOn), [done(completedOn)], {
      today: '2026-11-30',
      nonWorking: none,
      lateCaseIds: noLate,
    });

    expect(result).toMatchObject({ state: 'FINISHED', completedOn, onTime, workingDays });
  });

  it('counts a day off of the calendar as no working day', () => {
    const result = outcomeOf(unit('2026-11-13', '2026-11-13'), [done('2026-11-17')], {
      today: '2026-11-30',
      nonWorking: new Set(['2026-11-16']),
      lateCaseIds: noLate,
    });

    expect(result).toMatchObject({ onTime: false, workingDays: 2 });
  });

  it('is finished when the last of its tasks completes, on that day, however many tasks there are', () => {
    const result = outcomeOf(
      unit('2026-11-13', '2026-11-13'),
      [done('2026-11-13'), done('2026-11-16'), done('2026-11-13')],
      {
        today: '2026-11-30',
        nonWorking: none,
        lateCaseIds: noLate,
      },
    );

    expect(result).toMatchObject({ state: 'FINISHED', completedOn: '2026-11-16', onTime: false });
  });

  it('is not finished while one task is open (queued, retried, in progress or failed): it is open', () => {
    for (const status of ['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'FAILED'] as const) {
      const result = outcomeOf(unit('2026-11-13', '2026-11-13'), [done('2026-11-13'), open(status)], {
        today: '2026-11-12',
        nonWorking: none,
        lateCaseIds: noLate,
      });

      expect(result.state).toBe('OPEN');
    }
  });

  it('is open, and not judged, with no task at all (nothing to measure yet)', () => {
    expect(
      outcomeOf(unit('2026-11-13', '2026-11-13'), [], { today: '2026-11-30', nonWorking: none, lateCaseIds: noLate })
        .state,
    ).toBe('OPEN');
  });
});

describe('outcomeOf: a departure past its deadline is the same reading as the list `revocationOverdue`', () => {
  const context = (lateCaseIds: ReadonlySet<string>) => ({ today: '2026-11-17', nonWorking: none, lateCaseIds });

  it('is overdue when the case is in the set, even when no task was ever opened for a right (QĐ-110c)', () => {
    expect(outcomeOf(unit('2026-11-13', '2026-11-13'), [], context(new Set(['case-1'])))).toMatchObject({
      state: 'OVERDUE_OPEN',
    });
  });

  it('is not overdue outside the set: the open task of a case still in time is just open', () => {
    expect(outcomeOf(unit('2026-11-17', '2026-11-17'), [open()], context(noLate))).toMatchObject({ state: 'OPEN' });
  });

  it('is not finished while the case is in the set, even if some of its tasks are done: a right is left without one', () => {
    expect(
      outcomeOf(unit('2026-11-13', '2026-11-13'), [done('2026-11-13')], context(new Set(['case-1']))),
    ).toMatchObject({ state: 'OVERDUE_OPEN' });
  });
});

describe('outcomeOf: a transfer is measured from the day after the grace, by its own tasks (D-99 note 1, no `due_on` on them)', () => {
  // Grace ends on Friday 20/11: the tasks open on Saturday 21/11; the deadline is Monday 23/11 (the first working day, `QĐ-110c`).
  const transfer = unit('2026-11-21', '2026-11-23', { source: 'TRANSFER', id: 'transfer-1' });

  it('is on time when the last task completes by the Monday', () => {
    expect(
      outcomeOf(transfer, [done('2026-11-23')], { today: '2026-12-01', nonWorking: none, lateCaseIds: noLate }),
    ).toMatchObject({
      state: 'FINISHED',
      onTime: true,
      workingDays: 1,
    });
  });

  it('is late the day after', () => {
    expect(
      outcomeOf(transfer, [done('2026-11-24')], { today: '2026-12-01', nonWorking: none, lateCaseIds: noLate }),
    ).toMatchObject({
      onTime: false,
      workingDays: 2,
    });
  });

  it('is overdue when a task is open after the Monday, and the set of departures says nothing about it', () => {
    const ctx = { today: '2026-11-24', nonWorking: none, lateCaseIds: new Set(['transfer-1']) };

    expect(outcomeOf(transfer, [open('IN_PROGRESS')], ctx)).toMatchObject({ state: 'OVERDUE_OPEN' });
    expect(outcomeOf(transfer, [open('IN_PROGRESS')], { ...ctx, today: '2026-11-23' })).toMatchObject({
      state: 'OPEN',
    });
  });

  it('is not overdue with no task at all: a transfer of a person who held nothing has nothing to take back', () => {
    expect(outcomeOf(transfer, [], { today: '2026-12-01', nonWorking: none, lateCaseIds: noLate })).toMatchObject({
      state: 'OPEN',
    });
  });
});

describe('outcomeOf: the IT Admin of the unit is the one the tasks were given to', () => {
  it('takes the first IT Admin the tasks name, and none when no task names one', () => {
    const ctx = { today: '2026-11-30', nonWorking: none, lateCaseIds: noLate };

    expect(
      outcomeOf(unit('2026-11-13', '2026-11-13'), [done('2026-11-13', null), done('2026-11-13', 'it-2')], ctx)
        .itAdminId,
    ).toBe('it-2');
    expect(outcomeOf(unit('2026-11-13', '2026-11-13'), [done('2026-11-13', null)], ctx).itAdminId).toBeNull();
  });
});

describe('medianOf', () => {
  it.each<[number[], number | null]>([
    [[], null],
    [[3], 3],
    [[1, 5], 3],
    [[4, 1, 2], 2],
    [[1, 1, 2, 9], 1.5],
  ])('%j is %p', (values, median) => {
    expect(medianOf(values)).toBe(median);
  });
});

describe('summaryOf and rowsOf: the rate is of the units judged (finished or overdue), the open ones in time are not', () => {
  const ctx = { today: '2026-11-30', nonWorking: none, lateCaseIds: new Set(['late']) };
  const outcomes = [
    outcomeOf(unit('2026-11-13', '2026-11-13', { id: 'a' }), [done('2026-11-13')], ctx),
    outcomeOf(unit('2026-11-13', '2026-11-13', { id: 'b' }), [done('2026-11-17')], ctx),
    outcomeOf(unit('2026-11-13', '2026-11-13', { id: 'late' }), [open()], ctx),
    outcomeOf(unit('2026-11-30', '2026-11-30', { id: 'c', departmentId: 'd-eng' }), [open()], ctx),
  ];

  it('sums the figures: 1 on time of 3 judged, the median of 1 and 3 working days, one overdue open', () => {
    expect(summaryOf(outcomes)).toEqual({
      completed: 2,
      onTime: 1,
      overdueOpen: 1,
      medianWorkingDays: 2,
      onTimeRate: 1 / 3,
    });
  });

  it('has no rate and no median for nothing judged', () => {
    expect(summaryOf([outcomes[3]])).toEqual({
      completed: 0,
      onTime: 0,
      overdueOpen: 0,
      medianWorkingDays: null,
      onTimeRate: null,
    });
  });

  it('groups by department and by IT Admin, the groups with the most overdue first and then by key', () => {
    const byDepartment = rowsOf(outcomes, 'department');
    const byItAdmin = rowsOf(outcomes, 'itAdmin');

    expect(byDepartment.map((row) => [row.id, row.completed, row.overdueOpen])).toEqual([
      ['d-des', 2, 1],
      ['d-eng', 0, 0],
    ]);
    expect(byItAdmin.map((row) => [row.id, row.completed, row.overdueOpen])).toEqual([['it-1', 2, 1]]);
  });
});

describe('transferReRequestsOf: a new request of a person in the grace of their transfer, granted by its last day', () => {
  const graces = [
    { employeeId: 'p-1', effectiveOn: '2026-11-16', graceEndsOn: '2026-11-20' },
    { employeeId: 'p-2', effectiveOn: '2026-11-16', graceEndsOn: '2026-11-20' },
  ];

  it('counts the requests and the ones granted by the last day of the grace, the last day included', () => {
    const result = transferReRequestsOf(
      [
        { requesterEmployeeId: 'p-1', submittedOn: '2026-11-17', grantedOn: '2026-11-20' },
        { requesterEmployeeId: 'p-1', submittedOn: '2026-11-18', grantedOn: '2026-11-23' },
        { requesterEmployeeId: 'p-2', submittedOn: '2026-11-16', grantedOn: null },
        { requesterEmployeeId: 'p-2', submittedOn: '2026-11-17', grantedOn: '2026-11-17' },
      ],
      graces,
    );

    expect(result).toEqual({ total: 4, provisionedWithinGrace: 2 });
  });

  it('leaves out a request that falls in no grace of that person (another transfer, or none)', () => {
    expect(
      transferReRequestsOf(
        [
          { requesterEmployeeId: 'p-1', submittedOn: '2026-11-21', grantedOn: '2026-11-21' },
          { requesterEmployeeId: 'p-9', submittedOn: '2026-11-17', grantedOn: '2026-11-17' },
        ],
        graces,
      ),
    ).toEqual({ total: 0, provisionedWithinGrace: 0 });
  });
});
