import {
  checkWithdrawal,
  grantCancelRefusal,
  headMayWithdraw,
  withdrawalAuditOf,
  type WithdrawalFacts,
} from './withdrawal.policy';

const base: WithdrawalFacts = {
  actorEmployeeId: 'e1',
  requesterEmployeeId: 'e1',
  actorHeadsDepartment: false,
  state: 'PENDING',
  spendStage: null,
  reason: null,
};
const withFacts = (patch: Partial<WithdrawalFacts>): WithdrawalFacts => ({ ...base, ...patch });

describe('checkWithdrawal (US-05-08)', () => {
  it('lets the requester withdraw a request that still waits, whatever step it is at, with no reason', () => {
    for (const state of [
      'PENDING',
      'WAITING_CONTROLLED',
      'AWAITING_EXECUTION',
      'AWAITING_IT_ASSESSMENT',
      'AWAITING_SPEND_SUBMISSION',
      'AWAITING_SPEND_DECISION',
      'EXECUTING',
    ] as const) {
      expect(checkWithdrawal(withFacts({ state }))).toBeNull();
    }
  });

  it('refuses anybody who is not the requester, the person it is for included (AC-4, AC-8)', () => {
    expect(checkWithdrawal(withFacts({ actorEmployeeId: 'e2' }))).toBe('NOT_REQUESTER');
    expect(checkWithdrawal(withFacts({ actorEmployeeId: 'beneficiary', requesterEmployeeId: 'head' }))).toBe(
      'NOT_REQUESTER',
    );
  });

  it('lets the requester that is a head withdraw as the requester, with no reason', () => {
    expect(checkWithdrawal(withFacts({ actorHeadsDepartment: true }))).toBeNull();
  });

  it('refuses a request that has ended, and says the seat is real for a completed one (AC-3)', () => {
    for (const state of ['REJECTED', 'IT_REJECTED', 'FAILED', 'WITHDRAWN'] as const) {
      expect(checkWithdrawal(withFacts({ state }))).toBe('ALREADY_ENDED');
    }
    expect(checkWithdrawal(withFacts({ state: 'COMPLETED' }))).toBe('GRANT_COMPLETED');
  });

  it('refuses a second withdrawal while the IT Admin has still to close the failed task', () => {
    expect(checkWithdrawal(withFacts({ state: 'AWAITING_IT_CLOSE' }))).toBe('WITHDRAWAL_PENDING');
  });

  describe('the head of the department (US-06-14 AC-14)', () => {
    const head = { actorEmployeeId: 'head', actorHeadsDepartment: true, state: 'AWAITING_SPEND_SUBMISSION' as const };

    it('BR-MF1-06h/06i: withdraws, with a reason, a request that is blocked or one that waits for the confirmation of the reserve', () => {
      for (const spendStage of ['BLOCKED', 'RESERVE_CONFIRMATION'] as const) {
        expect(checkWithdrawal(withFacts({ ...head, spendStage, reason: 'Moved to next year' }))).toBeNull();
      }
    });

    it('refuses to withdraw without a reason, a blank one included', () => {
      expect(checkWithdrawal(withFacts({ ...head, spendStage: 'BLOCKED', reason: null }))).toBe('REASON_REQUIRED');
      expect(checkWithdrawal(withFacts({ ...head, spendStage: 'BLOCKED', reason: '   ' }))).toBe('REASON_REQUIRED');
    });

    it('does not withdraw a request that is anywhere else, nor one of another department', () => {
      for (const spendStage of ['NOT_SUBMITTED', 'WAITING_SPEND_DECISION', null] as const) {
        expect(checkWithdrawal(withFacts({ ...head, spendStage, reason: 'x' }))).toBe('NOT_REQUESTER');
      }
      expect(
        checkWithdrawal(withFacts({ ...head, actorHeadsDepartment: false, spendStage: 'BLOCKED', reason: 'x' })),
      ).toBe('NOT_REQUESTER');
    });
  });

  it('knows the three stages at which a head may act', () => {
    expect(headMayWithdraw('BLOCKED')).toBe(true);
    expect(headMayWithdraw('WAITING_SPEND_DECISION')).toBe(false);
    expect(headMayWithdraw(null)).toBe(false);
  });
});

describe('what the withdrawal of a request whose grant is under way is refused for, and what it records (US-05-08, US-05-13)', () => {
  it.each([
    ['a task being worked refuses', { status: 'RUNNING' }, { reason: 'GRANT_RUNNING', details: null }],
    [
      'a task that is done sends the person to the return of the seat',
      { status: 'COMPLETED', assignmentId: 'asg-1' },
      { reason: 'GRANT_COMPLETED', details: { assignmentId: 'asg-1' } },
    ],
    ['a task that ended refuses', { status: 'ENDED' }, { reason: 'ALREADY_ENDED', details: null }],
  ])('%s (grantCancelRefusal)', (_label, grant, expected) => {
    expect(grantCancelRefusal(grant)).toEqual(expected);
  });

  it.each([
    ['a task nobody has worked, cancelled', { status: 'CANCELLED' }],
    ['no task at all', { status: 'NO_TASK' }],
    ['a task that failed, which the IT Admin closes', { status: 'FAILED' }],
  ])('lets the request go on when the grant is %s (grantCancelRefusal)', (_label, grant) => {
    expect(grantCancelRefusal(grant)).toBeNull();
  });

  const request = { id: 'req-1', requesterEmployeeId: 'sender' };

  it('records a withdrawal that ended the request, by the sender or the head, and the reason', () => {
    expect(withdrawalAuditOf(request, { from: 'PENDING', actorEmployeeId: 'head', reason: 'Không cần' }, null)).toEqual(
      {
        action: 'ACCESS_REQUEST.WITHDRAWN',
        detail: {
          requestId: 'req-1',
          from: 'PENDING',
          to: 'WITHDRAWN',
          byRequester: false,
          withdrawnByEmployeeId: 'head',
          reason: 'Không cần',
        },
      },
    );
    expect(
      withdrawalAuditOf(request, { from: 'AWAITING_EXECUTION', actorEmployeeId: 'sender', reason: null }, null).detail,
    ).toMatchObject({ byRequester: true, reason: null });
  });

  it('records a withdrawal that waits for the IT Admin to close the task of a grant that failed', () => {
    expect(
      withdrawalAuditOf(request, { from: 'EXECUTING', actorEmployeeId: 'sender', reason: null }, { taskId: 'task-1' }),
    ).toEqual({
      action: 'ACCESS_REQUEST.WITHDRAWAL_REQUESTED',
      detail: { requestId: 'req-1', from: 'EXECUTING', to: 'AWAITING_IT_CLOSE', taskId: 'task-1' },
    });
  });
});
