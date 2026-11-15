import {
  cycleAcceptsWork,
  cycleStateOf,
  isPastYear,
  judgeDelete,
  judgeOpening,
  planCycleChange,
  windowOf,
} from './cycle.policy';

describe('the budget cycle policy (QĐ-111z)', () => {
  it('writes only the current year and the years to come (B7)', () => {
    expect(isPastYear(2025, 2026)).toBe(true);
    expect(isPastYear(2026, 2026)).toBe(false);
    expect(isPastYear(2027, 2026)).toBe(false);
  });

  it('accepts the work of the heads once Finance opened the cycle, and not while it is a draft', () => {
    expect(cycleAcceptsWork({ openedAt: null })).toBe(false);
    expect(cycleAcceptsWork({ openedAt: new Date('2026-11-01T00:00:00Z') })).toBe(true);
  });
});

const STORED = {
  submissionDeadline: '2026-12-01',
  decisionDeadline: '2026-12-15',
  annualCeilingMinor: 1000n,
  sharedPoolReserveMinor: 100n as bigint | null,
  priorities: null as string | null,
};
const OPENED = new Date('2026-11-01T00:00:00Z');

describe('the state of a cycle (QĐ-111z, BG-1)', () => {
  it('is a draft until Finance opens it, whatever the day', () => {
    expect(cycleStateOf({ openedAt: null, submissionDeadline: '2026-12-01' }, '2026-11-15')).toBe('DRAFT');
    expect(cycleStateOf({ openedAt: null, submissionDeadline: '2026-12-01' }, '2027-03-01')).toBe('DRAFT');
  });

  it('is open through the day of the submission deadline and locked from the day after it', () => {
    const cycle = { openedAt: OPENED, submissionDeadline: '2026-12-01' };

    expect(cycleStateOf(cycle, '2026-11-15')).toBe('OPEN');
    expect(cycleStateOf(cycle, '2026-12-01')).toBe('OPEN');
    expect(cycleStateOf(cycle, '2026-12-02')).toBe('LOCKED');
  });
});

describe('what a change of a cycle may be, by its state (QĐ-111z, R-14, US-06-15 AC-21)', () => {
  const change = (state: 'DRAFT' | 'OPEN' | 'LOCKED', update: object, today = '2026-11-15') =>
    planCycleChange(state, update, STORED, today);

  it('refuses every change of a locked cycle, the reserve with the annual ceiling (no reopening, R-14)', () => {
    expect(change('LOCKED', { submissionDeadline: '2026-12-20', reason: 'late' })).toEqual({ kind: 'LOCKED' });
    expect(change('LOCKED', { annualCeilingMinor: 1n, reason: 'x' })).toEqual({ kind: 'LOCKED' });
    expect(change('LOCKED', { sharedPoolReserveMinor: 1n, reason: 'x' })).toEqual({ kind: 'LOCKED' });
    expect(change('LOCKED', {})).toEqual({ kind: 'LOCKED' });
  });

  it('lets a draft change anything with no reason, a deadline in the past included', () => {
    const plan = change('DRAFT', {
      submissionDeadline: '2026-11-01',
      decisionDeadline: '2026-11-20',
      annualCeilingMinor: 2000n,
      sharedPoolReserveMinor: 0n,
      priorities: 'focus',
    });

    expect(plan).toMatchObject({
      kind: 'CHANGE',
      submission: '2026-11-01',
      decision: '2026-11-20',
      ceilingChanged: true,
      reserveChanged: true,
      submissionMoved: true,
    });
  });

  it('refuses deadlines out of order in any state that can change', () => {
    expect(change('DRAFT', { decisionDeadline: '2026-11-30' })).toEqual({ kind: 'DEADLINES_INVALID' });
    expect(change('OPEN', { submissionDeadline: '2026-12-20', reason: 'late' })).toEqual({ kind: 'DEADLINES_INVALID' });
  });

  it('asks an open cycle for a reason when the submission deadline moves, the annual ceiling changes or the reserve changes', () => {
    expect(change('OPEN', { submissionDeadline: '2026-12-05', decisionDeadline: '2026-12-20' })).toEqual({
      kind: 'REASON_REQUIRED',
    });
    expect(change('OPEN', { annualCeilingMinor: 900n })).toEqual({ kind: 'REASON_REQUIRED' });
    expect(change('OPEN', { sharedPoolReserveMinor: 50n })).toEqual({ kind: 'REASON_REQUIRED' });
    expect(change('OPEN', { annualCeilingMinor: 900n, reason: 'cut by the board' })).toMatchObject({
      kind: 'CHANGE',
      ceilingChanged: true,
      reserveChanged: false,
      submissionMoved: false,
    });
  });

  it('lets an open cycle move the submission deadline to today or later, with a reason, and not to a day that has passed', () => {
    expect(change('OPEN', { submissionDeadline: '2026-11-15', reason: 'brought forward' })).toMatchObject({
      kind: 'CHANGE',
      submissionMoved: true,
    });
    expect(change('OPEN', { submissionDeadline: '2026-11-14', reason: 'too late' })).toEqual({
      kind: 'DEADLINE_IN_PAST',
    });
  });

  it('lets an open cycle change the decision deadline and the priorities without a reason', () => {
    expect(change('OPEN', { decisionDeadline: '2026-12-31', priorities: 'security first' })).toMatchObject({
      kind: 'CHANGE',
      submissionMoved: false,
      ceilingChanged: false,
    });
  });

  it('answers a change that changes nothing as nothing, so no write and no record follow', () => {
    expect(change('OPEN', {})).toEqual({ kind: 'NOTHING' });
    expect(
      change('DRAFT', { submissionDeadline: '2026-12-01', annualCeilingMinor: 1000n, sharedPoolReserveMinor: 100n }),
    ).toEqual({ kind: 'NOTHING' });
  });

  it('counts a reserve never entered as a change when a figure, zero included, is given', () => {
    const plan = planCycleChange(
      'DRAFT',
      { sharedPoolReserveMinor: 0n },
      { ...STORED, sharedPoolReserveMinor: null },
      '2026-11-15',
    );

    expect(plan).toMatchObject({ kind: 'CHANGE', reserveChanged: true });
  });
});

describe('opening and deleting a cycle (QĐ-111z)', () => {
  it('opens a draft whose submission deadline is today or later', () => {
    expect(judgeOpening('DRAFT', '2026-11-15', '2026-11-15')).toEqual({ kind: 'OK' });
  });

  it('refuses a draft whose submission deadline has passed: it is edited first', () => {
    expect(judgeOpening('DRAFT', '2026-11-14', '2026-11-15')).toEqual({ kind: 'DEADLINE_PASSED' });
  });

  it('refuses a cycle that is open already, and one that is locked: there is no reopening', () => {
    expect(judgeOpening('OPEN', '2026-12-01', '2026-11-15')).toEqual({ kind: 'ALREADY_OPEN' });
    expect(judgeOpening('LOCKED', '2026-11-01', '2026-11-15')).toEqual({ kind: 'LOCKED' });
  });

  it('deletes only a draft', () => {
    expect(judgeDelete('DRAFT')).toEqual({ kind: 'OK' });
    expect(judgeDelete('OPEN')).toEqual({ kind: 'NOT_DRAFT' });
    expect(judgeDelete('LOCKED')).toEqual({ kind: 'NOT_DRAFT' });
  });
});

describe('windowOf (the window a department may be made in, QĐ-111ba, R-16)', () => {
  const next = (opened: boolean, firstVersionSent: boolean) => ({
    nextYear: 2027,
    nextCycle: { opened, firstVersionSent },
    anyCycle: true,
  });

  it('opens on 1 January of next year from the opening of that cycle until its first version is sent', () => {
    expect(windowOf(next(true, false))).toEqual({ kind: 'OPEN', effectiveFrom: '2027-01-01' });
  });

  it('is closed while that cycle is still a draft, and once its first version was sent', () => {
    expect(windowOf(next(false, false))).toEqual({ kind: 'CLOSED' });
    expect(windowOf(next(true, true))).toEqual({ kind: 'CLOSED' });
  });

  it('is not opened by the cycle of this year: no department is made in the middle of a year', () => {
    expect(windowOf({ nextYear: 2027, nextCycle: null, anyCycle: true })).toEqual({ kind: 'CLOSED' });
  });

  it('leaves an organization with no cycle at all to the installation', () => {
    expect(windowOf({ nextYear: 2027, nextCycle: null, anyCycle: false })).toEqual({ kind: 'NO_CYCLE_YET' });
  });
});
