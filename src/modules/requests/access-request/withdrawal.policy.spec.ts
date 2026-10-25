import { checkWithdrawal, headMayWithdraw, type WithdrawalFacts } from './withdrawal.policy';

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
      'AWAITING_FINANCE_REVIEW',
      'AWAITING_BUDGET',
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

    it('withdraws, with a reason, a request Finance gave back, one stopped by the data, or one that waits for a budget', () => {
      for (const spendStage of ['RETURNED_BY_FINANCE', 'BLOCKED', 'WAITING_BUDGET'] as const) {
        expect(checkWithdrawal(withFacts({ ...head, spendStage, reason: 'Moved to next year' }))).toBeNull();
      }
    });

    it('refuses to withdraw without a reason, a blank one included', () => {
      expect(checkWithdrawal(withFacts({ ...head, spendStage: 'BLOCKED', reason: null }))).toBe('REASON_REQUIRED');
      expect(checkWithdrawal(withFacts({ ...head, spendStage: 'BLOCKED', reason: '   ' }))).toBe('REASON_REQUIRED');
    });

    it('does not withdraw a request that is anywhere else, nor one of another department', () => {
      for (const spendStage of ['NOT_SUBMITTED', 'WAITING_FINANCE_REVIEW', 'WAITING_SPEND_DECISION', null] as const) {
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
