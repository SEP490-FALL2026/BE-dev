import {
  BUDGET_LACKING_CODES,
  checkReviewOutcome,
  checkReviewer,
  checkWaitingOutcome,
  type ReviewFacts,
} from './finance-review.policy';

const year = (code: string | null, y = 2026) => ({ year: y, code }) as ReviewFacts['check']['years'][number];
const facts = (codes: (string | null)[], extra: Partial<ReviewFacts> = {}): ReviewFacts => ({
  check: { years: codes.map((code, index) => year(code, 2026 + index)), planLineOverdue: false },
  departmentHasHead: true,
  ...extra,
});

describe('how a review of Finance may end (US-06-13, F33)', () => {
  describe('a budget to be made', () => {
    it.each(['NO_ACTIVE_BUDGET', 'INSUFFICIENT_BUDGET'])(
      'is chosen for a year with %s when somebody heads the department',
      (code) => {
        expect(checkReviewOutcome('NEEDS_BUDGET', facts([code]))).toBeNull();
      },
    );

    it('is chosen when only one of several years lacks a budget', () => {
      expect(checkReviewOutcome('NEEDS_BUDGET', facts(['BUDGET_OK', 'INSUFFICIENT_BUDGET']))).toBeNull();
    });

    it.each(['NO_ACTIVE_BUDGET', 'INSUFFICIENT_BUDGET'])(
      'is not chosen for %s when nobody heads the department, even if a version is current',
      (code) => {
        expect(checkReviewOutcome('NEEDS_BUDGET', facts([code], { departmentHasHead: false }))).toBe(
          'NO_HEAD_TO_PROPOSE',
        );
      },
    );

    it.each([['HIGH_VALUE'], ['BUDGET_OK'], [null]])('is not chosen for a year that is only %s', (code) => {
      expect(checkReviewOutcome('NEEDS_BUDGET', facts([code]))).toBe('NO_BUDGET_TO_MAKE');
    });

    it('names the two codes a new version can mend, and no other', () => {
      expect([...BUDGET_LACKING_CODES].sort()).toEqual(['INSUFFICIENT_BUDGET', 'NO_ACTIVE_BUDGET']);
    });
  });

  it('refuses an opinion while the plan line is overdue, and lets the request be given back whatever the check says', () => {
    const overdue = facts(['BUDGET_OK'], { check: { years: [year('BUDGET_OK')], planLineOverdue: true } });

    expect(checkReviewOutcome('ASSESSED', overdue)).toBe('PLAN_LINE_NOT_UPDATED');
    expect(checkReviewOutcome('RETURN_TO_HEAD', overdue)).toBeNull();
    expect(checkReviewOutcome('ASSESSED', facts(['HIGH_VALUE']))).toBeNull();
  });
});

describe('what Finance may do for a request that waits for a version and has no review open (J.3, F65)', () => {
  it('gives it back or gives an opinion, and never asks for a budget again', () => {
    expect(checkWaitingOutcome('RETURN_TO_HEAD', { planLineOverdue: false })).toBeNull();
    expect(checkWaitingOutcome('ASSESSED', { planLineOverdue: false })).toBeNull();
    expect(checkWaitingOutcome('NEEDS_BUDGET', { planLineOverdue: false })).toBe('ALREADY_AWAITING_BUDGET');
  });

  it('refuses an opinion while the plan line is overdue, as on a review', () => {
    expect(checkWaitingOutcome('ASSESSED', { planLineOverdue: true })).toBe('PLAN_LINE_NOT_UPDATED');
    expect(checkWaitingOutcome('RETURN_TO_HEAD', { planLineOverdue: true })).toBeNull();
  });
});

describe('who may end the review of a request (QĐ-82l(8), SoD-8, F32)', () => {
  const base = {
    actorEmployeeId: 'finance',
    requesterEmployeeId: 'requester',
    beneficiaryEmployeeIds: ['beneficiary'],
    spendDeciderEmployeeId: 'approver',
  };

  it('lets a Finance who is nobody to the request and does not decide its spend step end it', () => {
    expect(checkReviewer(base)).toBeNull();
    expect(checkReviewer({ ...base, spendDeciderEmployeeId: null })).toBeNull();
  });

  it.each([
    ['asked for the request', { requesterEmployeeId: 'finance' }],
    ['is the person it is for', { beneficiaryEmployeeIds: ['beneficiary', 'finance'] }],
  ])('refuses a Finance who %s', (_name, over) => {
    expect(checkReviewer({ ...base, ...over })).toBe('OWN_REQUEST');
  });

  it('refuses a Finance who will decide the spend step, the approver or the substitute of a conflict (SoD-8)', () => {
    expect(checkReviewer({ ...base, spendDeciderEmployeeId: 'finance' })).toBe('REVIEWER_IS_APPROVER');
  });

  it('judges the party before the approver, so one answer is given', () => {
    expect(checkReviewer({ ...base, requesterEmployeeId: 'finance', spendDeciderEmployeeId: 'finance' })).toBe(
      'OWN_REQUEST',
    );
  });
});
