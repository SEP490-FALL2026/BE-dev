import {
  blockersOf,
  cancelRefusal,
  changeLastDayRefusal,
  checklistOf,
  departmentWithoutHeadFrom,
  departureEffectiveOn,
  departureRevocationSource,
  handoverDueOn,
  isPastLastDay,
  namedRightsRefusal,
  pendingTransferRefusal,
  recordRefusal,
  revocationSelection,
  subjectRefusal,
  type RecordFacts,
  type RevocationFacts,
  type RightFacts,
} from './offboarding.policy';

const NOTE = 'Quyết định nghỉ việc số QD-1/2026';

const record = (extra: Partial<RecordFacts> = {}): RecordFacts => ({
  today: '2026-10-24',
  hireDate: '2020-01-01',
  placementFrom: '2026-01-05',
  lastWorkingDay: '2026-11-03',
  accessBlockMode: 'WITH_LAST_DAY',
  employee: { status: 'ACTIVE', workState: 'WORKING' },
  groundsNote: NOTE,
  pendingTransfer: null,
  cancelPendingTransfer: false,
  namedAsSuccessor: false,
  successor: null,
  ...extra,
});

const code = (refusal: { code: string } | null) => refusal?.code ?? null;

describe('the days of a departure', () => {
  it('ends the membership the day after the last working day, and never writes a departure blocked now into the past', () => {
    const base = { today: '2026-10-24', placementFrom: '2026-01-05' };

    expect(departureEffectiveOn({ ...base, lastWorkingDay: '2026-11-03', blockNow: false })).toBe('2026-11-04');
    expect(departureEffectiveOn({ ...base, lastWorkingDay: '2026-10-24', blockNow: true })).toBe('2026-10-25');
    expect(departureEffectiveOn({ ...base, lastWorkingDay: '2026-10-20', blockNow: true })).toBe('2026-10-24');
    expect(
      departureEffectiveOn({ today: '2026-10-24', placementFrom: null, lastWorkingDay: '2026-11-03', blockNow: false }),
    ).toBe('2026-11-04');
    expect(
      departureEffectiveOn({ today: '2026-10-24', placementFrom: null, lastWorkingDay: '2026-10-20', blockNow: true }),
    ).toBe('2026-10-24');
    expect(
      departureEffectiveOn({
        today: '2026-10-24',
        placementFrom: '2026-10-24',
        lastWorkingDay: '2026-10-20',
        blockNow: true,
      }),
    ).toBe('2026-10-25');
  });

  it('counts the deadline of the confirmation a working day before the last day, over the weekend and the days off', () => {
    expect(handoverDueOn('2026-09-30', new Set())).toBe('2026-09-29');
    expect(handoverDueOn('2026-10-05', new Set())).toBe('2026-10-02');
    expect(handoverDueOn('2026-10-05', new Set(['2026-10-02']))).toBe('2026-10-01');
  });

  it('says a handover is past its last day only while it is a handover', () => {
    expect(isPastLastDay('HANDING_OVER', '2026-10-01', '2026-10-02')).toBe(true);
    expect(isPastLastDay('HANDING_OVER', '2026-10-02', '2026-10-02')).toBe(false);
    expect(isPastLastDay('LEFT', '2026-10-01', '2026-10-02')).toBe(false);
  });
});

describe('whether a departure may be recorded', () => {
  it('accepts a whole planned handover and a departure blocked now with today as its last day', () => {
    expect(recordRefusal(record())).toBeNull();
    expect(recordRefusal(record({ accessBlockMode: 'BLOCK_NOW', lastWorkingDay: '2026-10-24' }))).toBeNull();
    expect(recordRefusal(record({ employee: { status: 'ACTIVE', workState: 'ON_LONG_LEAVE' } }))).toBeNull();
  });

  it.each([
    ['a person who has left', { employee: { status: 'TERMINATED', workState: 'LEFT' } }, 'EMPLOYEE_LEFT'],
    [
      'a person handing over already',
      { employee: { status: 'ACTIVE', workState: 'HANDING_OVER' } },
      'ALREADY_HANDING_OVER',
    ],
    ['no last working day, planned', { lastWorkingDay: undefined }, 'LAST_WORKING_DAY_REQUIRED'],
    ['a planned day in the past', { lastWorkingDay: '2026-10-23' }, 'LAST_WORKING_DAY_INVALID'],
    ['a day before the person came', { hireDate: '2026-11-10' }, 'LAST_WORKING_DAY_INVALID'],
    ['a day before the placement began', { placementFrom: '2026-11-10' }, 'LAST_WORKING_DAY_INVALID'],
    ['no basis', { groundsNote: undefined }, 'GROUNDS_REQUIRED'],
    ['a basis over 500 characters', { groundsNote: 'a'.repeat(501) }, 'GROUNDS_TOO_LONG'],
    ['a basis that is the code of a notice', { groundsNote: 'BM09-2026-000001' }, 'GROUNDS_IS_NOTICE'],
    [
      'a transfer that takes effect first, without the confirmation to cancel it',
      { pendingTransfer: { effectiveOn: '2026-12-01' } },
      'TRANSFER_CANCELLATION_REQUIRED',
    ],
    [
      'a transfer that takes effect by the last day',
      { pendingTransfer: { effectiveOn: '2026-11-03' }, cancelPendingTransfer: true },
      'PENDING_EVENT_EXISTS',
    ],
    ['a person named to follow a head', { namedAsSuccessor: true }, 'PENDING_EVENT_EXISTS'],
    [
      'a successor who cannot follow',
      { successor: { code: 'SUCCESSOR_NOT_A_MEMBER_ON_DATE' } },
      'SUCCESSOR_NOT_A_MEMBER_ON_DATE',
    ],
  ] as [string, Partial<RecordFacts>, string][])('refuses %s', (_name, facts, expected) => {
    expect(code(recordRefusal(record(facts)))).toBe(expected);
  });

  it('cancels the transfer that waits only when the Super Admin confirms it', () => {
    const waiting = { pendingTransfer: { effectiveOn: '2026-12-01' } };

    expect(code(recordRefusal(record(waiting)))).toBe('TRANSFER_CANCELLATION_REQUIRED');
    expect(recordRefusal(record({ ...waiting, cancelPendingTransfer: true }))).toBeNull();
  });
});

describe('moving, cancelling and leaving', () => {
  const change = (extra: object = {}) => ({
    state: 'HANDING_OVER' as const,
    accessBlockMode: 'WITH_LAST_DAY' as const,
    today: '2026-10-24',
    hireDate: '2020-01-01',
    placementFrom: '2026-01-05',
    currentLastWorkingDay: '2026-11-03',
    newLastWorkingDay: '2026-11-20',
    reason: 'Dời ngày',
    groundsNote: NOTE,
    successor: null,
    ...extra,
  });

  it.each([
    ['moves', {}, null],
    ['is not a case that left', { state: 'LEFT' }, 'CASE_LEFT'],
    ['is not a cancelled case', { state: 'CANCELLED' }, 'NOT_HANDING_OVER'],
    ['is not allowed after the last day', { today: '2026-11-04' }, 'LAST_DAY_ALREADY_PASSED'],
    ['needs a reason', { reason: '  ' }, 'REASON_REQUIRED'],
    ['needs a basis', { groundsNote: undefined }, 'GROUNDS_REQUIRED'],
    ['needs a basis that is not a notice', { groundsNote: 'BM09-2026-000123' }, 'GROUNDS_IS_NOTICE'],
    ['is not the same day', { newLastWorkingDay: '2026-11-03' }, 'NO_CHANGE'],
    ['is not in the past', { newLastWorkingDay: '2026-10-20' }, 'LAST_WORKING_DAY_INVALID'],
    [
      'judges the successor on the new day',
      { successor: { code: 'SUCCESSOR_NOT_A_MEMBER_ON_DATE' } },
      'SUCCESSOR_NOT_A_MEMBER_ON_DATE',
    ],
  ])('a move of the day %s', (_name, extra, expected) => {
    expect(code(changeLastDayRefusal(change(extra)))).toBe(expected);
  });

  it('cancels a handover under way with a reason and a basis, and only that', () => {
    expect(cancelRefusal({ state: 'HANDING_OVER', reason: 'Rút', groundsNote: NOTE })).toBeNull();
    expect(code(cancelRefusal({ state: 'HANDING_OVER', reason: '', groundsNote: NOTE }))).toBe('REASON_REQUIRED');
    expect(code(cancelRefusal({ state: 'HANDING_OVER', reason: 'Rút' }))).toBe('GROUNDS_REQUIRED');
    expect(code(cancelRefusal({ state: 'LEFT', reason: 'Rút', groundsNote: NOTE }))).toBe('CASE_LEFT');
  });
});

describe('the revocations of the rights', () => {
  it('gives the revocations of a departure the source its mode names (departureRevocationSource)', () => {
    expect(departureRevocationSource('WITH_LAST_DAY')).toBe('DEPARTURE');
    expect(departureRevocationSource('BLOCK_NOW')).toBe('ABRUPT_DEPARTURE');
  });

  const right = (id: string, extra: Partial<RightFacts> = {}): RightFacts => ({
    assignmentId: id,
    hasTask: false,
    revocable: true,
    provisioningType: 'K2',
    ...extra,
  });
  const rights = [right('a'), right('b'), right('c')];
  const revoke = (extra: Partial<RevocationFacts> = {}) =>
    revocationSelection({
      blocked: true,
      closed: false,
      named: undefined,
      rights,
      lockRecorded: false,
      lockGiven: true,
      ...extra,
    });

  it('selects every right without a task when none is named, and counts them itself (AC-4, L-412)', () => {
    expect(revoke()).toEqual({ refusal: null, selected: ['a', 'b', 'c'] });
    expect(revoke({ rights: [right('a', { hasTask: true }), right('b'), right('c')] }).selected).toEqual(['b', 'c']);
  });

  it('refuses when there is nothing left to take away', () => {
    expect(code(revoke({ rights: [] }).refusal)).toBe('NOTHING_TO_REVOKE');
    expect(code(revoke({ rights: [right('a', { hasTask: true })] }).refusal)).toBe('NOTHING_TO_REVOKE');
    expect(code(revoke({ rights: [right('k4', { revocable: false, provisioningType: 'K4' })] }).refusal)).toBe(
      'NOTHING_TO_REVOKE',
    );
  });

  it('skips a seat that has no revocation unless it is named, and then refuses the whole command', () => {
    const mixed = [right('a'), right('k4', { revocable: false, provisioningType: 'K4' })];

    expect(revoke({ rights: mixed }).selected).toEqual(['a']);
    expect(revoke({ rights: mixed, named: ['a', 'k4'] }).refusal).toEqual({
      code: 'REVOCATION_NOT_SUPPORTED',
      details: { assignmentId: 'k4', provisioningType: 'K4' },
    });
    expect(code(revoke({ named: ['zzz'] }).refusal)).toBe('ASSIGNMENT_NOT_AVAILABLE');
    expect(code(revoke({ named: ['a'], rights: [right('a', { hasTask: true })] }).refusal)).toBe(
      'ASSIGNMENT_NOT_AVAILABLE',
    );
  });

  it('refuses the first right named that is not there, has a task, or has no revocation, in the order named', () => {
    const held = [right('a'), right('t', { hasTask: true }), right('k4', { revocable: false, provisioningType: 'K4' })];

    expect(namedRightsRefusal(['a'], held)).toBeNull();
    expect(namedRightsRefusal(['a', 'zz', 't'], held)?.details).toEqual({ assignmentId: 'zz' });
    expect(code(namedRightsRefusal(['t'], held))).toBe('ASSIGNMENT_NOT_AVAILABLE');
    expect(code(namedRightsRefusal(['k4', 't'], held))).toBe('REVOCATION_NOT_SUPPORTED');
  });

  it.each([
    ['not blocked', { blocked: false }, 'CASE_NOT_BLOCKED'],
    ['closed', { closed: true }, 'CASE_CLOSED'],
    ['no lock recorded or given', { lockGiven: false }, 'ACCOUNT_LOCK_NOT_RECORDED'],
    ['the lock given when it was recorded', { lockRecorded: true }, 'ALREADY_RECORDED'],
  ])('refuses %s', (_name, extra, expected) => {
    expect(code(revoke(extra).refusal)).toBe(expected);
  });

  it('accepts a lock recorded before and none given', () => {
    expect(revoke({ lockRecorded: true, lockGiven: false }).refusal).toBeNull();
  });
});

describe('what keeps a case open and the four steps', () => {
  const blockerFacts = {
    state: 'LEFT' as const,
    closed: false,
    lockRecorded: true,
    mailboxLocked: true,
    openRights: 0,
  };

  it('keeps a person who has left open only on the lock of the account, the lock of the mailbox and the rights with no completed task (QĐ-110e)', () => {
    expect(blockersOf(blockerFacts)).toEqual({});
    expect(blockersOf({ ...blockerFacts, lockRecorded: false, mailboxLocked: false, openRights: 2 })).toEqual({
      ACCOUNT_LOCK_NOT_RECORDED: 1,
      MAILBOX_LOCK_NOT_RECORDED: 1,
      PERSONAL_RIGHTS_OPEN: 2,
    });
    expect(blockersOf({ ...blockerFacts, mailboxLocked: false })).toEqual({ MAILBOX_LOCK_NOT_RECORDED: 1 });
    expect(blockersOf({ ...blockerFacts, openRights: 1 })).toEqual({ PERSONAL_RIGHTS_OPEN: 1 });
  });

  it('shows nothing for a handover under way, a case that was cancelled or a case that is closed', () => {
    const everythingOpen = { ...blockerFacts, lockRecorded: false, mailboxLocked: false, openRights: 2 };

    expect(blockersOf({ ...everythingOpen, state: 'HANDING_OVER' })).toEqual({});
    expect(blockersOf({ ...everythingOpen, state: 'CANCELLED' })).toEqual({});
    expect(blockersOf({ ...everythingOpen, closed: true })).toEqual({});
  });

  it('puts the steps in the order they are done, marks the lock urgent only for a departure nobody planned, and never waits on a handover (QĐ-110g)', () => {
    const steps = checklistOf({
      blockNow: true,
      lockRecorded: false,
      heldRights: 3,
      withoutTask: 3,
      accessRunsOn: 0,
      opened: 0,
      released: 0,
    });

    expect(steps).toEqual({
      dataHandover: { state: 'DONE', pendingDuties: 0 },
      accountLock: { state: 'PENDING', urgent: true },
      revokeAccess: { state: 'PENDING', heldRights: 3, withoutTask: 3, accessRunsOn: 0 },
      seatsReleased: { state: 'PENDING', opened: 0, released: 0 },
    });
    expect(
      checklistOf({
        blockNow: false,
        lockRecorded: true,
        heldRights: 1,
        withoutTask: 0,
        accessRunsOn: 1,
        opened: 3,
        released: 2,
      }),
    ).toMatchObject({
      accountLock: { state: 'DONE', urgent: false },
      revokeAccess: { state: 'IN_PROGRESS' },
      seatsReleased: { state: 'IN_PROGRESS', opened: 3, released: 2 },
    });
    expect(
      checklistOf({
        blockNow: false,
        lockRecorded: true,
        heldRights: 0,
        withoutTask: 0,
        accessRunsOn: 0,
        opened: 3,
        released: 3,
      }),
    ).toMatchObject({ revokeAccess: { state: 'DONE' }, seatsReleased: { state: 'DONE' } });
  });
});

describe('what a departure is recorded for, before and after the locks', () => {
  const working = { status: 'ACTIVE', workState: 'WORKING' };

  it.each([
    ['nobody', null, '2026-11-03', 'EMPLOYEE_NOT_FOUND'],
    ['a person who is terminated', { status: 'TERMINATED', workState: 'WORKING' }, '2026-11-03', 'EMPLOYEE_LEFT'],
    ['a person who has left', { status: 'ACTIVE', workState: 'LEFT' }, '2026-11-03', 'EMPLOYEE_LEFT'],
    ['a handover under way', { status: 'ACTIVE', workState: 'HANDING_OVER' }, '2026-11-03', 'ALREADY_HANDING_OVER'],
    ['gone and also handing over', { status: 'TERMINATED', workState: 'HANDING_OVER' }, undefined, 'EMPLOYEE_LEFT'],
    ['a working person with no last working day', working, undefined, 'LAST_WORKING_DAY_REQUIRED'],
    ['a person on long leave', { status: 'ACTIVE', workState: 'ON_LONG_LEAVE' }, '2026-11-03', null],
    ['a working person with a last working day', working, '2026-11-03', null],
  ])('refuses %s at once, in the order of the screen (subjectRefusal)', (_label, seen, lastWorkingDay, code) => {
    expect(subjectRefusal(seen, lastWorkingDay)).toBe(code);
  });

  it('says from which day the department has no head only when a head hands over to nobody (departmentWithoutHeadFrom)', () => {
    expect(departmentWithoutHeadFrom({ successorEmployeeId: null }, '2026-11-04')).toBe('2026-11-04');
    expect(departmentWithoutHeadFrom({ successorEmployeeId: 'e-2' }, '2026-11-04')).toBeNull();
    expect(departmentWithoutHeadFrom(null, '2026-11-04')).toBeNull();
  });

  it('refuses a departure that comes after the transfer takes effect, or before it without the confirmation to cancel it', () => {
    const waiting = { effectiveOn: '2026-11-10' };

    expect(pendingTransferRefusal(null, '2026-11-12', false)).toBeNull();
    expect(pendingTransferRefusal(waiting, '2026-11-10', true)).toEqual({
      code: 'PENDING_EVENT_EXISTS',
      details: { kind: 'TRANSFER', effectiveOn: '2026-11-10' },
    });
    expect(pendingTransferRefusal(waiting, '2026-11-09', false)).toEqual({ code: 'TRANSFER_CANCELLATION_REQUIRED' });
    expect(pendingTransferRefusal(waiting, '2026-11-09', true)).toBeNull();
  });
});
