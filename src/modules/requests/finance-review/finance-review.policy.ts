import type { CheckResult } from '../spend/budget-check.policy';

/**
 * How a Finance review may end (`US-06-13`). The review is an advice and never a decision: no outcome approves or refuses
 * the request (`SoD-3`); the spending approver decides after it. Which fields an outcome needs is the shape of the body;
 * what is judged here is whether the outcome fits the check the review is about.
 */
export type ReviewOutcomeKind = 'ASSESSED' | 'RETURN_TO_HEAD' | 'NEEDS_BUDGET';

export type ReviewRefusal =
  /** The plan line is still overdue: Finance moves it on the line, or gives the request back (`AC-4`). */
  | 'PLAN_LINE_NOT_UPDATED'
  /** There is no budget to make: no year lacks one or has too little, or this is neither of the two (`AC-11`). */
  | 'NO_BUDGET_TO_MAKE'
  /** Nobody heads the department, so nobody can propose the budget (`AC-11`). */
  | 'NO_HEAD_TO_PROPOSE'
  /** The request already waits for a budget: it asks for none again (J.3, F65). */
  | 'ALREADY_AWAITING_BUDGET'
  /** Finance is the one who asked or one the request is for: nobody independent reviews it (`QĐ-82l`(8)). */
  | 'OWN_REQUEST'
  /** Finance is the one who will decide the spend step of the request: the two are two people (`SoD-8`, F32). */
  | 'REVIEWER_IS_APPROVER';

export interface ReviewFacts {
  check: Pick<CheckResult, 'years' | 'planLineOverdue'>;
  /** Somebody heads the department of the request today, and so could send a proposal for its Cost Center. */
  departmentHasHead: boolean;
}

/**
 * The years of a check that a new version of the budget can mend: a year with no budget, or with a budget of too little (F33,
 * `FR-3.20`). A year that is only of high value, and a plan line that is overdue, are not mended by a budget.
 */
export const BUDGET_LACKING_CODES: ReadonlySet<string> = new Set(['NO_ACTIVE_BUDGET', 'INSUFFICIENT_BUDGET']);

/**
 * Whether the outcome fits the check. _A budget to be made_ is chosen for a year with no budget and for a year with too little, and
 * only when somebody heads the department to propose it: with nobody, it is not chosen, even when a version is current (F33).
 */
export function checkReviewOutcome(outcome: ReviewOutcomeKind, facts: ReviewFacts): ReviewRefusal | null {
  if (outcome === 'ASSESSED') return facts.check.planLineOverdue ? 'PLAN_LINE_NOT_UPDATED' : null;
  if (outcome === 'RETURN_TO_HEAD') return null;
  if (!facts.check.years.some((year) => year.code !== null && BUDGET_LACKING_CODES.has(year.code))) {
    return 'NO_BUDGET_TO_MAKE';
  }

  return facts.departmentHasHead ? null : 'NO_HEAD_TO_PROPOSE';
}

/**
 * What a Finance outcome does for a request that waits for a version of the budget and has no review open (J.3, F65): it may be
 * given back to its head or assessed, never sent to wait again; an opinion is refused while the plan line is overdue, as on a review.
 */
export function checkWaitingOutcome(
  outcome: ReviewOutcomeKind,
  facts: Pick<ReviewFacts['check'], 'planLineOverdue'>,
): ReviewRefusal | null {
  if (outcome === 'NEEDS_BUDGET') return 'ALREADY_AWAITING_BUDGET';
  if (outcome === 'ASSESSED' && facts.planLineOverdue) return 'PLAN_LINE_NOT_UPDATED';

  return null;
}

export interface ReviewerFacts {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  /** Who holds or will hold the spend step of the request, if anybody can (`routeSpendStep`); null when nobody can. */
  spendDeciderEmployeeId: string | null;
}

/**
 * Whether Finance may end a review of this request: not when they asked for it or it is for them, and not when they are the one who
 * will decide the spend step (the spending approver, or the substitute of a conflict of interest) (`SoD-8`, F32); null when they may.
 */
export function checkReviewer(
  facts: ReviewerFacts,
): Extract<ReviewRefusal, 'OWN_REQUEST' | 'REVIEWER_IS_APPROVER'> | null {
  if (
    facts.actorEmployeeId === facts.requesterEmployeeId ||
    facts.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)
  ) {
    return 'OWN_REQUEST';
  }

  return facts.spendDeciderEmployeeId === facts.actorEmployeeId ? 'REVIEWER_IS_APPROVER' : null;
}
