import { checkSpendDecider, judgeApproval, spendDecisionRecordOf } from './spend-decision.policy';

describe('who decides the spend step (US-06-01 AC-8, US-16-03)', () => {
  const facts = {
    actorEmployeeId: 'c1',
    requesterEmployeeId: 'h1',
    beneficiaryEmployeeIds: ['e1'],
    assigneeEmployeeId: 'c1',
    stepState: 'PENDING',
    stepAwaitsConversion: false,
  };

  it('is the person the step is given to, who did not ask and is not given the access', () => {
    expect(checkSpendDecider(facts)).toBeNull();
  });

  it('is nobody else, whatever role they hold', () => {
    expect(checkSpendDecider({ ...facts, actorEmployeeId: 'f1' })).toBe('NOT_THE_ASSIGNEE');
    expect(checkSpendDecider({ ...facts, assigneeEmployeeId: 's1' })).toBe('NOT_THE_ASSIGNEE');
    expect(checkSpendDecider({ ...facts, assigneeEmployeeId: null })).toBe('NOT_THE_ASSIGNEE');
  });

  it('is never the one who asked or the one it is for, and that is the first thing told', () => {
    expect(checkSpendDecider({ ...facts, requesterEmployeeId: 'c1' })).toBe('OWN_REQUEST');
    expect(checkSpendDecider({ ...facts, beneficiaryEmployeeIds: ['c1'] })).toBe('OWN_REQUEST');
    expect(checkSpendDecider({ ...facts, actorEmployeeId: 'e1', assigneeEmployeeId: 'e1' })).toBe('OWN_REQUEST');
  });

  it('lets the new holder decide a spend step handed over by a role transfer', () => {
    // The step moved from the old spending approver to `c1` in the transaction of the transfer: the holder decides and is not refused.
    expect(checkSpendDecider({ ...facts, assigneeEmployeeId: 'c1' })).toBeNull();
  });

  it('is only a step that is pending', () => {
    expect(checkSpendDecider({ ...facts, stepState: 'APPROVED' })).toBe('STEP_NOT_PENDING');
    expect(checkSpendDecider({ ...facts, stepState: 'CLOSED' })).toBe('STEP_NOT_PENDING');
  });
});

describe('BR-MF1-07c: what the check made now allows of an approval', () => {
  it('BR-MF1-07c: takes an approval that is within the base, with no confirmation to ask for', () => {
    expect(judgeApproval({ outcome: 'WITHIN_BASE', blockReasons: [] }, false)).toEqual({
      kind: 'OK',
      usesReserve: false,
    });
  });

  it('BR-MF1-07c: takes an approval that uses the reserve when the head confirmed it on this step, and says it uses it', () => {
    expect(judgeApproval({ outcome: 'USES_RESERVE', blockReasons: [] }, true)).toEqual({
      kind: 'OK',
      usesReserve: true,
    });
  });

  it('BR-MF1-07c: a confirmation that is not needed any more (the request is within the base now) is not an obstacle', () => {
    expect(judgeApproval({ outcome: 'WITHIN_BASE', blockReasons: [] }, true)).toEqual({
      kind: 'OK',
      usesReserve: false,
    });
  });

  it('BR-MF1-07c: a request that uses the reserve with no confirmation on the step goes back to its head', () => {
    expect(judgeApproval({ outcome: 'USES_RESERVE', blockReasons: [] }, false)).toEqual({
      kind: 'RETURNED',
      reasons: ['RESERVE_UNCONFIRMED'],
    });
  });

  it('BR-MF1-07c: a request that is blocked now goes back to its head with every reason, confirmed or not (there is no override)', () => {
    const blocked = { outcome: 'BLOCKED', blockReasons: ['PRICE_EXPIRED', 'OVER_RESERVE'] } as const;

    expect(judgeApproval(blocked, false)).toEqual({ kind: 'RETURNED', reasons: ['PRICE_EXPIRED', 'OVER_RESERVE'] });
    expect(judgeApproval(blocked, true)).toEqual({ kind: 'RETURNED', reasons: ['PRICE_EXPIRED', 'OVER_RESERVE'] });
  });

  it('M-12, RV-09: no approved budget in the Cost Center of now is the reason that already exists, not a new one', () => {
    expect(judgeApproval({ outcome: 'BLOCKED', blockReasons: ['NO_APPROVED_BUDGET'] }, true)).toEqual({
      kind: 'RETURNED',
      reasons: ['NO_APPROVED_BUDGET'],
    });
  });

  it('never approves on a check made before the three outcomes, which has no outcome', () => {
    expect(judgeApproval({ outcome: null, blockReasons: [] }, true)).toEqual({ kind: 'RETURNED', reasons: [] });
  });
});

describe('what the decision of the spend step is recorded as (US-06-01 AC-2, AC-4, AC-5)', () => {
  const request = { id: 'req-1' };

  it('records an approval in the role the person decided in, sends the request to be carried out, and says whether it used the reserve', () => {
    expect(
      spendDecisionRecordOf(
        { request },
        {
          decision: 'APPROVED',
          checkId: 'check-1',
          reason: null,
          usesReserve: true,
          reserveReason: 'Cần gấp cho dự án',
        },
      ),
    ).toEqual({
      deciderRole: 'SPENDING_APPROVER',
      requestState: 'AWAITING_EXECUTION',
      action: 'ACCESS_REQUEST.SPEND_APPROVED',
      detail: {
        requestId: 'req-1',
        oneStep: false,
        checkId: 'check-1',
        decision: 'APPROVED',
        deciderRole: 'SPENDING_APPROVER',
        usesReserve: true,
        reserveReason: 'Cần gấp cho dự án',
        requestState: 'AWAITING_EXECUTION',
      },
    });
  });

  it('records a refusal as REJECTED, in the role of the spending approver and no other', () => {
    const recorded = spendDecisionRecordOf(
      { request },
      { decision: 'REJECTED', checkId: null, reason: 'Không cần nữa', usesReserve: false, reserveReason: null },
    );

    expect(recorded).toMatchObject({
      deciderRole: 'SPENDING_APPROVER',
      requestState: 'REJECTED',
      action: 'ACCESS_REQUEST.SPEND_REJECTED',
      detail: { checkId: null, decision: 'REJECTED', usesReserve: false, deciderRole: 'SPENDING_APPROVER' },
    });
  });

  it('never writes a substitute for a conflict of interest as the role of the decision', () => {
    for (const decision of ['APPROVED', 'REJECTED'] as const) {
      const recorded = spendDecisionRecordOf(
        { request },
        { decision, checkId: null, reason: null, usesReserve: false, reserveReason: null },
      );

      expect(recorded.deciderRole).toBe('SPENDING_APPROVER');
      expect(JSON.stringify(recorded)).not.toContain('CONFLICT_SUBSTITUTE');
    }
  });
});
