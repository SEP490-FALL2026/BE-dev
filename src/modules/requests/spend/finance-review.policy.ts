import type { CheckResult } from './budget-check.policy';

/**
 * How a Finance review may end (`US-06-13`). The review is an advice and never a decision: no outcome approves or refuses
 * the request (`SoD-3`); the spending approver decides after it. Which fields an outcome needs is the shape of the body;
 * what is judged here is whether the outcome fits the check the review is about.
 */
export type ReviewOutcomeKind = 'ASSESSED' | 'RETURN_TO_HEAD' | 'NEEDS_BUDGET';

export type ReviewRefusal =
  /** The plan line is still overdue: Finance moves it on the line, or gives the request back (`AC-4`). */
  | 'PLAN_LINE_NOT_UPDATED'
  /** There is no budget to make: the year has one, or this is not a year without one (`AC-11`). */
  | 'NO_BUDGET_TO_MAKE'
  /** Nobody heads the department, so nobody can propose the budget (`AC-11`). */
  | 'NO_HEAD_TO_PROPOSE';

export interface ReviewFacts {
  check: Pick<CheckResult, 'years' | 'planLineOverdue'>;
  /** Somebody heads the department of the request today, and so could send a proposal for its Cost Center. */
  departmentHasHead: boolean;
}

export function checkReviewOutcome(outcome: ReviewOutcomeKind, facts: ReviewFacts): ReviewRefusal | null {
  if (outcome === 'ASSESSED') return facts.check.planLineOverdue ? 'PLAN_LINE_NOT_UPDATED' : null;
  if (outcome === 'RETURN_TO_HEAD') return null;
  if (!facts.check.years.some((year) => year.code === 'NO_ACTIVE_BUDGET')) return 'NO_BUDGET_TO_MAKE';

  return facts.departmentHasHead ? null : 'NO_HEAD_TO_PROPOSE';
}
