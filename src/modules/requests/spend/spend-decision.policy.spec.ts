import type { YearResult } from './budget-check.policy';
import { checkSpendDecider, judgeApproval, spendDeciderRoleOf, spendDecisionRecordOf } from './spend-decision.policy';

const year = (value: number, code: YearResult['code']): YearResult => ({
  year: value,
  costMinor: 1n,
  code,
  versionId: null,
  budgetMinor: null,
  heldMinor: null,
  spentMinor: null,
  remainingMinor: null,
  shareBasisPoints: null,
  pendingMinor: null,
});
const check = (
  years: YearResult[],
  over: { planLineOverdue?: boolean; staleCostEvidence?: boolean; periodClosed?: boolean } = {},
) => ({ years, planLineOverdue: false, staleCostEvidence: false, periodClosed: false, ...over });

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

  it('refuses a decision on a legacy step: held by a substitute who never held the role, frozen until the conversion', () => {
    expect(checkSpendDecider({ ...facts, stepAwaitsConversion: true })).toBe('STEP_AWAITING_CONVERSION');
    // After OWN_REQUEST and NOT_THE_ASSIGNEE, before STEP_NOT_PENDING.
    expect(checkSpendDecider({ ...facts, stepAwaitsConversion: true, requesterEmployeeId: 'c1' })).toBe('OWN_REQUEST');
    expect(checkSpendDecider({ ...facts, stepAwaitsConversion: true, actorEmployeeId: 'f1' })).toBe('NOT_THE_ASSIGNEE');
    expect(checkSpendDecider({ ...facts, stepAwaitsConversion: true, stepState: 'CLOSED' })).toBe(
      'STEP_AWAITING_CONVERSION',
    );
  });

  it('lets the new holder decide a spend step handed over by a role transfer', () => {
    // The step moved from the old spending approver to `c1` in the transaction of the transfer: the holder has a grant, so the step is
    // not legacy (the caller reads `everHeldSpendingApproverAmong` of the holder) and the decision is not refused.
    expect(checkSpendDecider({ ...facts, assigneeEmployeeId: 'c1', stepAwaitsConversion: false })).toBeNull();
  });

  it('is only a step that is pending', () => {
    expect(checkSpendDecider({ ...facts, stepState: 'APPROVED' })).toBe('STEP_NOT_PENDING');
    expect(checkSpendDecider({ ...facts, stepState: 'CLOSED' })).toBe('STEP_NOT_PENDING');
  });
});

describe('what the check made now allows of an approval (US-06-01 AC-5, AC-16, AC-17, AC-18, AC-21)', () => {
  it('takes an approval when everything is in order, with no override to give', () => {
    expect(judgeApproval(check([year(2026, 'BUDGET_OK')]), false, null)).toEqual({ kind: 'OK', overriddenYears: [] });
  });

  it('takes a high value as it is once Finance has looked at it, and sends it back to Finance when it has not (AC-18)', () => {
    expect(judgeApproval(check([year(2026, 'HIGH_VALUE')]), true, null)).toEqual({ kind: 'OK', overriddenYears: [] });
    expect(judgeApproval(check([year(2026, 'HIGH_VALUE')]), false, null)).toEqual({ kind: 'NEEDS_REVIEW' });
  });

  it('sends back to Finance what turned into an exception since the request was sent', () => {
    expect(judgeApproval(check([year(2026, 'INSUFFICIENT_BUDGET')]), false, null)).toEqual({ kind: 'NEEDS_REVIEW' });
    expect(judgeApproval(check([year(2026, 'NO_ACTIVE_BUDGET')]), false, { years: [2026] })).toEqual({
      kind: 'NEEDS_REVIEW',
    });
  });

  it('needs an override for a year with less than the request costs or with no budget, once Finance has looked (AC-5)', () => {
    expect(judgeApproval(check([year(2026, 'INSUFFICIENT_BUDGET')]), true, null)).toEqual({
      kind: 'OVERRIDE_REQUIRED',
      years: [2026],
    });
    expect(judgeApproval(check([year(2026, 'INSUFFICIENT_BUDGET')]), true, { years: [2026] })).toEqual({
      kind: 'OK',
      overriddenYears: [2026],
    });
    expect(judgeApproval(check([year(2026, 'NO_ACTIVE_BUDGET')]), true, { years: [2026] })).toMatchObject({
      kind: 'OK',
    });
  });

  it('wants the override to name exactly the years that need it, and no other (AC-21)', () => {
    const years = [year(2026, 'BUDGET_OK'), year(2027, 'NO_ACTIVE_BUDGET')];

    expect(judgeApproval(check(years), true, { years: [2027] })).toEqual({ kind: 'OK', overriddenYears: [2027] });
    expect(judgeApproval(check(years), true, { years: [2026] })).toEqual({ kind: 'OVERRIDE_MISMATCH', years: [2027] });
    expect(judgeApproval(check(years), true, { years: [2026, 2027] })).toEqual({
      kind: 'OVERRIDE_MISMATCH',
      years: [2027],
    });
    expect(judgeApproval(check(years), true, null)).toEqual({ kind: 'OVERRIDE_REQUIRED', years: [2027] });
  });

  it('has no override to accept when nothing needs one', () => {
    expect(judgeApproval(check([year(2026, 'BUDGET_OK')]), true, { years: [2026] })).toEqual({
      kind: 'OVERRIDE_NOT_NEEDED',
    });
    expect(judgeApproval(check([year(2026, 'HIGH_VALUE')]), true, { years: [2026] })).toEqual({
      kind: 'OVERRIDE_NOT_NEEDED',
    });
  });

  it('is never accepted by an override when the data is at fault, and goes back to the head (AC-18)', () => {
    expect(judgeApproval(check([year(2026, 'BUDGET_OK')], { staleCostEvidence: true }), true, null)).toEqual({
      kind: 'BLOCKED',
      reason: 'STALE_COST_EVIDENCE',
    });
    expect(judgeApproval(check([year(2025, null)], { periodClosed: true }), true, { years: [2025] })).toEqual({
      kind: 'BLOCKED',
      reason: 'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
    });
    expect(
      judgeApproval(check([year(2026, 'INSUFFICIENT_BUDGET')], { staleCostEvidence: true }), true, { years: [2026] }),
    ).toMatchObject({ kind: 'BLOCKED' });
  });

  it('is never accepted by an override while the plan line is overdue: it is for Finance again', () => {
    expect(judgeApproval(check([year(2026, 'BUDGET_OK')], { planLineOverdue: true }), true, null)).toEqual({
      kind: 'NEEDS_REVIEW',
    });
  });
});

describe('what the decision of the spend step is recorded as (US-06-01 AC-2, AC-4, AC-5)', () => {
  const step = { id: 'step-1', samePersonAsSpend: false, noIndependentReview: true };
  const request = { id: 'req-1' };

  it('records an approval in the role the person decided in, sends the request to be carried out, and says what was overridden', () => {
    expect(
      spendDecisionRecordOf(
        { conflictSubstituteEmployeeId: null },
        'approver',
        { request, step },
        {
          decision: 'APPROVED',
          checkId: 'check-1',
          reason: null,
          override: { reason: 'Cần gấp', years: [2026, 2027] },
        },
      ),
    ).toEqual({
      deciderRole: 'SPENDING_APPROVER',
      requestState: 'AWAITING_EXECUTION',
      action: 'ACCESS_REQUEST.SPEND_APPROVED',
      detail: {
        requestId: 'req-1',
        checkId: 'check-1',
        decision: 'APPROVED',
        deciderRole: 'SPENDING_APPROVER',
        override: true,
        overrideYears: '2026,2027',
        samePersonAsSpend: false,
        noIndependentReview: true,
        requestState: 'AWAITING_EXECUTION',
      },
    });
  });

  it('records a refusal as REJECTED, with no override, and the substitute in the role of the substitute for the conflict', () => {
    const recorded = spendDecisionRecordOf(
      { conflictSubstituteEmployeeId: 'substitute' },
      'substitute',
      { request, step },
      { decision: 'REJECTED', checkId: null, reason: 'Không đủ ngân sách', override: null },
    );

    expect(recorded).toMatchObject({
      deciderRole: 'CONFLICT_SUBSTITUTE',
      requestState: 'REJECTED',
      action: 'ACCESS_REQUEST.SPEND_REJECTED',
      detail: { checkId: null, decision: 'REJECTED', override: false, overrideYears: '' },
    });
  });

  it('is the approver when somebody else is the substitute', () => {
    expect(
      spendDecisionRecordOf(
        { conflictSubstituteEmployeeId: 'substitute' },
        'approver',
        { request, step },
        { decision: 'REJECTED', checkId: null, reason: null, override: null },
      ).deciderRole,
    ).toBe('SPENDING_APPROVER');
  });
});

describe('the role the spending approver decides in (US-06-01)', () => {
  it('is the substitute for the conflict when the person is the one named so, and the approver otherwise', () => {
    expect(spendDeciderRoleOf({ conflictSubstituteEmployeeId: 'sub' }, 'sub')).toBe('CONFLICT_SUBSTITUTE');
    expect(spendDeciderRoleOf({ conflictSubstituteEmployeeId: 'sub' }, 'approver')).toBe('SPENDING_APPROVER');
    expect(spendDeciderRoleOf({ conflictSubstituteEmployeeId: null }, 'approver')).toBe('SPENDING_APPROVER');
  });
});
