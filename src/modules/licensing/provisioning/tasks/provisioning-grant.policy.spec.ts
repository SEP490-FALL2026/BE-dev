import {
  beneficiaryGrantRefusal,
  claimMatchesAnswer,
  grantPurchaseOf,
  grantTaskAudit,
  grantWarnings,
  revocationActionForRegrant,
} from './provisioning-grant.policy';

describe('what the grant of the seat of a request is judged and recorded by (US-07-01, QĐ-89a, SoD-5)', () => {
  const answer = { employeeId: 'emp-1', planId: 'plan-1', seat: 'PERSONAL' as const };

  it('goes on only when the request claimed is for the person, the plan, the kind of seat and the replaced right that were read before', () => {
    expect(claimMatchesAnswer({ ...answer }, answer)).toBe(true);
    expect(
      claimMatchesAnswer({ ...answer, replacesAssignmentId: null }, { ...answer, replacesAssignmentId: undefined }),
    ).toBe(true);
    expect(
      claimMatchesAnswer(
        { ...answer, replacesAssignmentId: 'asg-old' },
        { ...answer, replacesAssignmentId: 'asg-old' },
      ),
    ).toBe(true);
    expect(
      claimMatchesAnswer({ ...answer, replacesAssignmentId: 'asg-old' }, { ...answer, replacesAssignmentId: null }),
    ).toBe(false);
    expect(
      claimMatchesAnswer({ ...answer, replacesAssignmentId: 'asg-1' }, { ...answer, replacesAssignmentId: 'asg-2' }),
    ).toBe(false);
    expect(claimMatchesAnswer({ ...answer, employeeId: 'emp-2' }, answer)).toBe(false);
    expect(claimMatchesAnswer({ ...answer, planId: 'plan-2' }, answer)).toBe(false);
    expect(claimMatchesAnswer({ ...answer, seat: 'SERVICE' }, answer)).toBe(false);
  });

  it.each([
    ['no live revocation task', null, [], 'PROCEED'],
    ['queued revocation with only TRANSFER reason', { status: 'QUEUED' }, ['TRANSFER'], 'WITHDRAW_TRANSFER'],
    [
      'queued revocation with multiple TRANSFER reasons',
      { status: 'QUEUED' },
      ['TRANSFER', 'TRANSFER'],
      'WITHDRAW_TRANSFER',
    ],
    ['queued revocation with TRANSFER and DEPARTURE reasons', { status: 'QUEUED' }, ['TRANSFER', 'DEPARTURE'], 'BLOCK'],
    ['queued revocation with no standing reason', { status: 'QUEUED' }, [], 'BLOCK'],
    ['in-progress revocation with TRANSFER reason', { status: 'IN_PROGRESS' }, ['TRANSFER'], 'BLOCK'],
    ['failed revocation with TRANSFER reason', { status: 'FAILED' }, ['TRANSFER'], 'BLOCK'],
    ['completed revocation with TRANSFER reason', { status: 'COMPLETED' }, ['TRANSFER'], 'BLOCK'],
  ] as const)('decides %s for regrant -> %s', (_name, task, sources, expected) => {
    expect(revocationActionForRegrant(task, sources)).toBe(expected);
  });

  it('says in the audit entry which request the task is for, which seat, the channel and who is in charge by default', () => {
    expect(grantTaskAudit('req-1', 'asg-1', { channel: 'MANUAL', defaultResponsibleEmployeeId: 'it-1' }, null)).toEqual(
      {
        requestId: 'req-1',
        assignmentId: 'asg-1',
        channel: 'MANUAL',
        defaultResponsibleEmployeeId: 'it-1',
      },
    );
  });

  it('adds whether the IT Admin answered for the account themselves only when a person answers for it', () => {
    const task = { channel: 'MANUAL', defaultResponsibleEmployeeId: null };

    expect(grantTaskAudit('req-1', 'asg-1', task, true)).toMatchObject({ selfExecuted: true });
    expect(grantTaskAudit('req-1', 'asg-1', task, false)).toMatchObject({ selfExecuted: false });
  });

  it('warns that the department has no IT Admin when the person in charge by default is nobody', () => {
    expect(grantWarnings({ itAdminEmployeeId: null })).toEqual(['DEPARTMENT_WITHOUT_IT_ADMIN']);
    expect(grantWarnings({ itAdminEmployeeId: 'it-1' })).toEqual([]);
    expect(grantWarnings(null)).toEqual([]);
  });
});

describe('G9-04 what a grant records as bought (BR-MF1-09b, BR-MF1-09d)', () => {
  const now = new Date('2026-11-09T03:00:00Z');

  it('records K1_SUBSCRIPTION for every K1 grant: each one buys the seat of its holder', () => {
    expect(grantPurchaseOf('K1', { purchased: false }, now)).toEqual({
      kind: 'K1_SUBSCRIPTION',
      reason: null,
      purchasedAt: now,
    });
  });

  it('R-49: records nothing for a grant that carries on a right it replaced, K1 included: the seat of the old right is the seat of the new one', () => {
    expect(grantPurchaseOf('K1', { purchased: false }, now, true)).toBeNull();
    expect(grantPurchaseOf('K2', { purchased: false }, now, true)).toBeNull();
  });

  it('records the purchase the pool allowed for K2 or K4, and none for a seat taken from the pool', () => {
    expect(grantPurchaseOf('K2', { purchased: true, kind: 'POOL_TOP_UP', reason: 'why' }, now)).toEqual({
      kind: 'POOL_TOP_UP',
      reason: 'why',
      purchasedAt: now,
    });
    expect(grantPurchaseOf('K2', { purchased: false }, now)).toBeNull();
    expect(grantPurchaseOf('K5', { purchased: false }, now)).toBeNull();
  });

  it.each([
    ['works and is not blocked', { status: 'ACTIVE', accessBlocked: false }, null],
    ['has left', { status: 'TERMINATED', accessBlocked: false }, 'LEFT'],
    ['has left and is blocked', { status: 'TERMINATED', accessBlocked: true }, 'LEFT'],
    [
      'still has the status of work but a departure blocks their access today (QĐ-110d)',
      { status: 'ACTIVE', accessBlocked: true },
      'ACCESS_BLOCKED',
    ],
  ] as const)('does not begin the grant for a beneficiary who %s', (_name, facts, expected) => {
    expect(beneficiaryGrantRefusal(facts)).toBe(expected);
  });
});
