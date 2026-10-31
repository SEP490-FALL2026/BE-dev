import { chargedCostCenterId } from '../access-request/access-request.policy';
import type { CheckResult } from '../spend/budget-check.policy';
import type { ReviewRefusal } from '../spend/spend.errors';

/**
 * How a Finance review may end (`US-06-13`). The review is an advice and never a decision: no outcome approves or refuses
 * the request (`SoD-3`); the spending approver decides after it. Which fields an outcome needs is the shape of the body;
 * what is judged here is whether the outcome fits the check the review is about.
 */
export type ReviewOutcomeKind = 'ASSESSED' | 'RETURN_TO_HEAD' | 'NEEDS_BUDGET';

export interface ReviewFacts {
  check: Pick<CheckResult, 'years' | 'planLineOverdue'>;
  /** Somebody heads the department of the request today, and so could send a proposal for its Cost Center. */
  departmentHasHead: boolean;
}

/**
 * The years of a check that a new version of the budget can mend: a year with no budget, or with a budget of too little (`FR-3.20`). A year that is only of high value, and a plan line that is overdue, are not mended by a budget.
 */
export const BUDGET_LACKING_CODES: ReadonlySet<string> = new Set(['NO_ACTIVE_BUDGET', 'INSUFFICIENT_BUDGET']);

/**
 * Whether the outcome fits the check. _A budget to be made_ is chosen for a year with no budget and for a year with too little, and
 * only when somebody heads the department to propose it: with nobody, it is not chosen, even when a version is current.
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
 * What a Finance outcome does for a request that waits for a version of the budget and has no review open (J.3): it may be
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
 * will decide the spend step (the spending approver, or the substitute of a conflict of interest) (`SoD-8`); null when they may.
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

const OUTCOME_CODE = {
  ASSESSED: 'ASSESSED',
  RETURN_TO_HEAD: 'RETURNED_TO_HEAD',
  NEEDS_BUDGET: 'BUDGET_REVISION_NEEDED',
} as const;

/** How the review ended, as the record of it and the Audit Trail name it. */
export const reviewOutcomeCode = (outcome: ReviewOutcomeKind): (typeof OUTCOME_CODE)[ReviewOutcomeKind] =>
  OUTCOME_CODE[outcome];

/** The Cost Center and the first year of the check that has no budget or too little: where the budget is asked for. */
function budgetAskedFor(
  request: { id: string; costCenterId: string | null },
  years: readonly { year: number; code: string | null }[],
): { costCenterId: string } | { costCenterId: string; year: number } {
  const lacking = years
    .filter((year) => year.code !== null && BUDGET_LACKING_CODES.has(year.code))
    .map((year) => year.year)
    .sort((a, b) => a - b);
  const costCenterId = chargedCostCenterId(request);

  return lacking.length === 0 ? { costCenterId } : { costCenterId, year: lacking[0] };
}

/**
 * What the audit entry `ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED` says: what the check was and how the review ended. The head is told
 * why the request came back, in Finance's own words, and for a budget asked for the Cost Center and the first year that lacks one (what
 * the notice names, never a figure); the notice carries nothing else of the review.
 */
export function reviewCompletedDetail(
  request: { id: string; costCenterId: string | null },
  check: { id: string; years: readonly { year: number; code: string | null }[] },
  /** The opinion is Finance's advice to the approver: it is never in the audit entry. */
  body: { outcome: ReviewOutcomeKind; opinion?: string | null; direction?: string | null; reason?: string | null },
  waiting: boolean,
): { [key: string]: string | number | boolean } {
  return {
    requestId: request.id,
    checkId: check.id,
    outcome: reviewOutcomeCode(body.outcome),
    ...(body.direction ? { direction: body.direction } : {}),
    ...(body.outcome === 'RETURN_TO_HEAD' && body.reason ? { reason: body.reason } : {}),
    ...(body.outcome === 'NEEDS_BUDGET' ? budgetAskedFor(request, check.years) : {}),
    ...(waiting ? { whileWaiting: true } : {}),
  };
}
