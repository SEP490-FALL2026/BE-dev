import {
  cancelRefusal,
  newTransferRefusal,
  rescheduleRefusal,
  retiredDestinationRefusal,
  successorRefusal,
  type NewTransferFacts,
  type PendingTransferFacts,
  type SuccessorFacts,
} from './transfer.policy';

const GROUNDS = { type: 'DECISION', reference: 'QD-12/2026', issuer: 'HR Department', issuedOn: '2026-06-20' };
const NO_SUCCESSOR: SuccessorFacts = { required: false, chosen: undefined, candidate: null };

const facts = (patch: Partial<NewTransferFacts> = {}): NewTransferFacts => ({
  namedAsSuccessor: false,
  today: '2026-10-15',
  effectiveOn: '2026-11-01',
  employee: { status: 'ACTIVE', workState: 'WORKING' },
  current: { departmentId: 'dep-des', validFrom: '2026-01-01' },
  target: { departmentId: 'dep-fin' },
  destinationDepartment: { active: true },
  grounds: GROUNDS,
  pending: null,
  successor: NO_SUCCESSOR,
  ...patch,
});

const code = (patch: Partial<NewTransferFacts>) => newTransferRefusal(facts(patch))?.code;

describe('whether a transfer may be recorded (US-03-01)', () => {
  it('lets a whole transfer through', () => {
    expect(newTransferRefusal(facts())).toBeNull();
  });

  it.each([
    [
      'the person has left (AC-15)',
      { employee: { status: 'TERMINATED' as const, workState: 'LEFT' as const } },
      'EMPLOYEE_LEFT',
    ],
    ['the department does not change', { target: { departmentId: 'dep-des' } }, 'NO_CHANGE'],
    ['the day is before today (AC-16)', { effectiveOn: '2026-10-01' }, 'EFFECTIVE_DATE_IN_PAST'],
    [
      'the day is the first day of the current placement',
      { effectiveOn: '2026-01-01', today: '2026-01-01' },
      'EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD',
    ],
    ['the destination does not exist', { destinationDepartment: null }, 'DEPARTMENT_NOT_FOUND'],
    ['the destination is retired', { destinationDepartment: { active: false } }, 'DEPARTMENT_INACTIVE'],
    ['the grounds are empty (AC-18)', { grounds: undefined }, 'GROUNDS_REQUIRED'],
    ['the grounds are a notice', { grounds: { ...GROUNDS, reference: 'BM09-2026-000001' } }, 'GROUNDS_IS_NOTICE'],
    ['another transfer waits (AC-21)', { pending: { effectiveOn: '2026-12-01' } }, 'PENDING_EVENT_EXISTS'],
    ['another transfer names the person to follow its head', { namedAsSuccessor: true }, 'PENDING_EVENT_EXISTS'],
    [
      'the person is handing over to leave',
      { employee: { status: 'ACTIVE' as const, workState: 'HANDING_OVER' as const } },
      'PENDING_EVENT_EXISTS',
    ],
  ])('refuses when %s', (_name, patch, expected) => {
    expect(code(patch)).toBe(expected);
  });

  it('records a transfer into a department that has no Cost Center like any other (QĐ-87d(3), F44)', () => {
    // The destination is judged by whether it exists and takes people; the policy is not told of a Cost Center at all.
    expect(Object.keys(facts().destinationDepartment ?? {})).toEqual(['active']);
    expect(newTransferRefusal(facts({ destinationDepartment: { active: true } }))).toBeNull();
  });

  it('allows today, and a person on a long leave', () => {
    expect(code({ effectiveOn: '2026-10-15' })).toBeUndefined();
    expect(code({ employee: { status: 'ACTIVE', workState: 'ON_LONG_LEAVE' } })).toBeUndefined();
  });

  it('changes the department only (QĐ-87e): a job title is not a fact of a transfer, and a department that stays is no transfer', () => {
    expect('jobTitleId' in facts().target).toBe(false);
    expect(code({ target: { departmentId: 'dep-des' }, destinationDepartment: null })).toBe('NO_CHANGE');
  });

  it('names the part of the basis that is missing', () => {
    expect(newTransferRefusal(facts({ grounds: { ...GROUNDS, issuer: '' } }))).toEqual({
      code: 'GROUNDS_INCOMPLETE',
      details: { missing: ['issuer'] },
    });
  });

  it('says the same as the policy does when the database finds the destination retired', () => {
    expect(retiredDestinationRefusal()).toEqual(
      newTransferRefusal(facts({ destinationDepartment: { active: false } })),
    );
  });
});

describe('who follows the head of the department a person leaves (US-03-01 AC-8, QĐ-66a)', () => {
  const required = (patch: Partial<SuccessorFacts>): SuccessorFacts => ({ ...NO_SUCCESSOR, required: true, ...patch });
  const member = {
    isTransferee: false,
    memberOfOldDepartmentOnDay: true,
    stillWorking: true,
    holdsSuperAdmin: false,
    hasPendingTransfer: false,
  };

  it('asks nothing when the person is not the head', () => {
    expect(successorRefusal(NO_SUCCESSOR)).toBeNull();
  });

  it('asks for a choice, and accepts that nobody follows', () => {
    expect(successorRefusal(required({}))?.code).toBe('HEAD_SUCCESSOR_REQUIRED');
    expect(successorRefusal(required({ chosen: { kind: 'NONE' } }))).toBeNull();
  });

  it.each([
    ['is not a member of the old department that day', { memberOfOldDepartmentOnDay: false }, 'NOT_A_MEMBER_ON_DATE'],
    ['is the person who moves', { isTransferee: true }, 'SAME_PERSON'],
    ['has left', { stillWorking: false }, 'EMPLOYEE_NOT_ACTIVE'],
    ['holds Super Admin', { holdsSuperAdmin: true }, 'SUPER_ADMIN_CANNOT_HEAD'],
    ['has a transfer of their own waiting', { hasPendingTransfer: true }, 'HAS_PENDING_TRANSFER'],
  ])('refuses a successor who %s', (_name, patch, reason) => {
    expect(
      successorRefusal(required({ chosen: { kind: 'EMPLOYEE', employeeId: 'e' }, candidate: { ...member, ...patch } })),
    ).toEqual({ code: 'SUCCESSOR_NOT_A_MEMBER_ON_DATE', details: { reason } });
  });

  it('refuses a successor who does not exist, and accepts a member who works', () => {
    const chosen = { kind: 'EMPLOYEE', employeeId: 'e' } as const;
    expect(successorRefusal(required({ chosen, candidate: null }))?.code).toBe('SUCCESSOR_NOT_A_MEMBER_ON_DATE');
    expect(successorRefusal(required({ chosen, candidate: member }))).toBeNull();
  });
});

describe('moving or cancelling a transfer that has not taken effect (US-03-01 AC-19, AC-20)', () => {
  const pending = (patch: Partial<PendingTransferFacts> = {}): PendingTransferFacts => ({
    status: 'PENDING',
    effectiveOn: '2026-12-01',
    today: '2026-11-20',
    periodStart: '2026-01-01',
    reason: 'The department asked for later',
    grounds: GROUNDS,
    ...patch,
  });
  const move = (patch: Partial<PendingTransferFacts> = {}, newEffectiveOn = '2026-12-15') =>
    rescheduleRefusal({ ...pending(patch), newEffectiveOn, successor: NO_SUCCESSOR })?.code;

  it('moves a waiting transfer to a later day, with a reason and a basis', () => {
    expect(move()).toBeUndefined();
  });

  it.each([
    ['has taken effect', { status: 'EFFECTIVE' as const }, 'ALREADY_EFFECTIVE'],
    ['has its day today or before (the placement began)', { effectiveOn: '2026-11-20' }, 'ALREADY_EFFECTIVE'],
    ['was cancelled', { status: 'CANCELLED' as const }, 'ALREADY_CANCELLED'],
    ['has no reason', { reason: '  ' }, 'REASON_REQUIRED'],
    ['has no basis', { grounds: undefined }, 'GROUNDS_REQUIRED'],
  ])('refuses a move of a transfer that %s', (_name, patch, expected) => {
    expect(move(patch)).toBe(expected);
  });

  it('refuses the same day, a day in the past and a day not after the placement the person has', () => {
    expect(move({}, '2026-12-01')).toBe('NO_CHANGE');
    expect(move({}, '2026-11-01')).toBe('EFFECTIVE_DATE_IN_PAST');
    expect(move({ periodStart: '2026-12-20' }, '2026-12-15')).toBe('EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD');
  });

  it('judges the successor again on the new day', () => {
    const successor: SuccessorFacts = {
      required: true,
      chosen: { kind: 'EMPLOYEE', employeeId: 'h5' },
      candidate: {
        isTransferee: false,
        memberOfOldDepartmentOnDay: false,
        stillWorking: true,
        holdsSuperAdmin: false,
        hasPendingTransfer: false,
      },
    };
    expect(rescheduleRefusal({ ...pending(), newEffectiveOn: '2026-12-15', successor })?.code).toBe(
      'SUCCESSOR_NOT_A_MEMBER_ON_DATE',
    );
  });

  it('cancels a waiting transfer, and says the same things about the day, the reason and the basis', () => {
    expect(cancelRefusal(pending())).toBeNull();
    expect(cancelRefusal(pending({ status: 'CANCELLED' }))?.code).toBe('ALREADY_CANCELLED');
    expect(cancelRefusal(pending({ effectiveOn: '2026-11-19' }))?.code).toBe('ALREADY_EFFECTIVE');
    expect(cancelRefusal(pending({ reason: '' }))?.code).toBe('REASON_REQUIRED');
    expect(cancelRefusal(pending({ grounds: { ...GROUNDS, type: '' } }))?.code).toBe('GROUNDS_INCOMPLETE');
  });
});
