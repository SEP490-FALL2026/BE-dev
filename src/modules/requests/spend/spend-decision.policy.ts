import type { CheckResult, YearCode } from './budget-check.policy';

/**
 * The rules of the decision of the spending approver on the spend step (`US-06-01`), as pure decisions: who may decide, and
 * what the check made again at the moment of deciding allows. The approver decides on the figures of that check, not on those
 * the request was sent with (`AC-18`); the system never decides in their place (`SoD-6`).
 */

export type DeciderRefusal =
  /** The one who decides is not the one who asked or is given the access, whatever role they hold (`SoD-4`, `US-16-03`). */
  | 'OWN_REQUEST'
  /** Only the person the step is given to decides it; Finance, the head, the IT Admin, an Employee do not (`AC-8`). */
  | 'NOT_THE_ASSIGNEE'
  /**
   * The step is held by a person who never held the spending approver role (the substitute of a conflict of interest, under the
   * rule before `QĐ-93`): frozen until the conversion command moves it (`QĐ-93k(2)`). A spending approver whose step was handed over by
   * a transfer or a revocation is not in this case: they have a grant, so the step is not legacy.
   */
  | 'STEP_AWAITING_CONVERSION'
  | 'STEP_NOT_PENDING';

export function checkSpendDecider(facts: {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  assigneeEmployeeId: string | null;
  stepState: string;
  /** `isLegacyStep` of the step, read with the history of the grant of its holder. */
  stepAwaitsConversion: boolean;
}): DeciderRefusal | null {
  if (
    facts.actorEmployeeId === facts.requesterEmployeeId ||
    facts.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)
  ) {
    return 'OWN_REQUEST';
  }
  if (facts.assigneeEmployeeId === null || facts.assigneeEmployeeId !== facts.actorEmployeeId) {
    return 'NOT_THE_ASSIGNEE';
  }
  if (facts.stepAwaitsConversion) return 'STEP_AWAITING_CONVERSION';

  return facts.stepState === 'PENDING' ? null : 'STEP_NOT_PENDING';
}

export type BlockedReason = 'STALE_COST_EVIDENCE' | 'CLOSED_OR_EXPIRED_BUDGET_PERIOD';

export type ApprovalVerdict =
  /** The approval may be saved; these are the years whose exception it accepts (none when there is none). */
  | { kind: 'OK'; overriddenYears: number[] }
  /** The data is at fault now: nothing is saved, the step closes and the request goes back to its head (`AC-18`). */
  | { kind: 'BLOCKED'; reason: BlockedReason }
  /** Something is out of the ordinary and Finance has not looked at it: nothing is saved and the review opens (`AC-18`). */
  | { kind: 'NEEDS_REVIEW' }
  /** A year has less money than the request costs, or none: the approval is saved only as an override of these years (`AC-5`, `AC-21`). */
  | { kind: 'OVERRIDE_REQUIRED'; years: number[] }
  /** The override names years other than the ones that need it. */
  | { kind: 'OVERRIDE_MISMATCH'; years: number[] }
  /** The override has nothing to accept. */
  | { kind: 'OVERRIDE_NOT_NEEDED' };

const OVERRIDABLE: ReadonlySet<YearCode> = new Set<YearCode>(['INSUFFICIENT_BUDGET', 'NO_ACTIVE_BUDGET']);

/**
 * What the check made now allows of an approval. The two codes of the data and an overdue plan line are never accepted by an
 * override (`QĐ-82d`); a year with less than the request costs, or with no budget, is accepted by an override with its reason
 * and the years it names (`QĐ-82d`(1), `AC-16`, `AC-21`); a high value that has enough money is accepted as it is once Finance
 * has reviewed it. Whatever is out of the ordinary and was not reviewed goes back to Finance first.
 */
export function judgeApproval(
  check: Pick<CheckResult, 'years' | 'planLineOverdue' | 'staleCostEvidence' | 'periodClosed'>,
  reviewed: boolean,
  override: { years: readonly number[] } | null,
): ApprovalVerdict {
  if (check.staleCostEvidence) return { kind: 'BLOCKED', reason: 'STALE_COST_EVIDENCE' };
  if (check.periodClosed) return { kind: 'BLOCKED', reason: 'CLOSED_OR_EXPIRED_BUDGET_PERIOD' };

  const ordinary = check.years.every((year) => year.code === 'BUDGET_OK');
  if (check.planLineOverdue || (!ordinary && !reviewed)) return { kind: 'NEEDS_REVIEW' };

  const needed = check.years
    .filter((year) => year.code !== null && OVERRIDABLE.has(year.code))
    .map((year) => year.year)
    .sort((a, b) => a - b);
  if (needed.length === 0) return override ? { kind: 'OVERRIDE_NOT_NEEDED' } : { kind: 'OK', overriddenYears: [] };
  if (!override) return { kind: 'OVERRIDE_REQUIRED', years: needed };

  const given = [...new Set(override.years)].sort((a, b) => a - b);
  const same = given.length === needed.length && given.every((year, index) => year === needed[index]);

  return same ? { kind: 'OK', overriddenYears: needed } : { kind: 'OVERRIDE_MISMATCH', years: needed };
}

/**
 * What the decision of the spend step is written as (`US-06-01` AC-2, AC-4, AC-5): the role the person decided in — always the spending
 * approver, nobody decides in their place any more (`QĐ-93c`) — the state the request goes to, and the audit entry. An approval goes to
 * be carried out, a refusal ends the request.
 */
export function spendDecisionRecordOf(
  of: {
    request: { id: string };
    step: { id: string; samePersonAsSpend: boolean; noIndependentReview: boolean };
  },
  decided: {
    decision: 'APPROVED' | 'REJECTED';
    checkId: string | null;
    reason: string | null;
    override: { reason: string; years: readonly number[] } | null;
  },
): {
  deciderRole: 'SPENDING_APPROVER';
  requestState: 'AWAITING_EXECUTION' | 'REJECTED';
  action: string;
  detail: { [key: string]: string | boolean | null };
} {
  const deciderRole = 'SPENDING_APPROVER';
  const approved = decided.decision === 'APPROVED';
  const requestState = approved ? 'AWAITING_EXECUTION' : 'REJECTED';

  return {
    deciderRole,
    requestState,
    action: approved ? 'ACCESS_REQUEST.SPEND_APPROVED' : 'ACCESS_REQUEST.SPEND_REJECTED',
    detail: {
      requestId: of.request.id,
      checkId: decided.checkId,
      decision: decided.decision,
      deciderRole,
      override: decided.override !== null,
      overrideYears: (decided.override?.years ?? []).join(','),
      samePersonAsSpend: of.step.samePersonAsSpend,
      noIndependentReview: of.step.noIndependentReview,
      requestState,
    },
  };
}
