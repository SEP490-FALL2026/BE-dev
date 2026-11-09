import { checkReviewOutcome } from '../finance-review/finance-review.policy';
import { routeFinanceReview, routeSpendStep } from './spend-routing.policy';

const people = { requesterEmployeeId: 'h1', beneficiaryEmployeeIds: ['e1', 'e2'] };

describe('who holds the spend step (US-06-01, US-05-11 AC-10, D-S21)', () => {
  it('is the spending approver', () => {
    expect(routeSpendStep(people, 'c1')).toEqual({ outcome: 'ASSIGNED', assigneeEmployeeId: 'c1' });
  });

  it('waits when nobody holds the role, and never goes to someone else', () => {
    expect(routeSpendStep(people, null)).toEqual({ outcome: 'WAITING', reason: 'NO_SPENDING_APPROVER' });
  });

  it('waits for the spending approver and never assigns a substitute', () => {
    const waiting = { outcome: 'WAITING', reason: 'SPENDING_APPROVER_IS_PARTY' };

    // Only the data of before the rule gets here: a request cannot be sent by or for the spending approver any more.
    expect(routeSpendStep(people, 'e2')).toEqual(waiting);
    expect(routeSpendStep(people, 'h1')).toEqual(waiting);
    expect(routeSpendStep(people, 'e1')).not.toHaveProperty('substituted');
  });
});

describe('who holds the Finance review (US-06-13 AC-5, AC-6)', () => {
  it('is Finance', () => {
    expect(routeFinanceReview(people, 'f1')).toEqual({ outcome: 'ASSIGNED', assigneeEmployeeId: 'f1' });
  });

  it('is nobody when Finance is the one it is for or the one who asked, and the request carries the flag', () => {
    expect(routeFinanceReview(people, 'e1')).toEqual({ outcome: 'SKIPPED' });
    expect(routeFinanceReview(people, 'h1')).toEqual({ outcome: 'SKIPPED' });
  });

  it('waits when nobody holds the role of Finance, and is not given to another role', () => {
    expect(routeFinanceReview(people, null)).toEqual({ outcome: 'WAITING', reason: 'NO_FINANCE_REVIEWER' });
  });
});

describe('how a review may end (US-06-13 AC-4, AC-11)', () => {
  const check = (codes: ('NO_ACTIVE_BUDGET' | 'BUDGET_OK')[], planLineOverdue = false) => ({
    planLineOverdue,
    years: codes.map((code, index) => ({
      year: 2026 + index,
      costMinor: 1n,
      code,
      versionId: null,
      budgetMinor: null,
      heldMinor: null,
      spentMinor: null,
      remainingMinor: null,
      shareBasisPoints: null,
      pendingMinor: null,
    })),
  });

  it('may give an opinion on an exception', () => {
    expect(checkReviewOutcome('ASSESSED', { check: check(['BUDGET_OK']), departmentHasHead: true })).toBeNull();
  });

  it('may always give the request back to the head', () => {
    expect(checkReviewOutcome('RETURN_TO_HEAD', { check: check(['BUDGET_OK']), departmentHasHead: false })).toBeNull();
  });

  it('asks for a budget only for a year that has none, and only when a head can propose it', () => {
    expect(
      checkReviewOutcome('NEEDS_BUDGET', { check: check(['NO_ACTIVE_BUDGET']), departmentHasHead: true }),
    ).toBeNull();
    expect(checkReviewOutcome('NEEDS_BUDGET', { check: check(['BUDGET_OK']), departmentHasHead: true })).toBe(
      'NO_BUDGET_TO_MAKE',
    );
    expect(checkReviewOutcome('NEEDS_BUDGET', { check: check(['NO_ACTIVE_BUDGET']), departmentHasHead: false })).toBe(
      'NO_HEAD_TO_PROPOSE',
    );
  });
});
