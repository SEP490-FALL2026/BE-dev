import type { BlockReason, BudgetOutcome } from './budget-check.policy';

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
  | 'STEP_NOT_PENDING';

export function checkSpendDecider(facts: {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  assigneeEmployeeId: string | null;
  stepState: string;
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
  return facts.stepState === 'PENDING' ? null : 'STEP_NOT_PENDING';
}

/** Why an approval is not saved and the request goes back to its head: the check made again blocks it, or the reserve it uses is not confirmed. */
export type ReturnReason = BlockReason | 'RESERVE_UNCONFIRMED';

export type ApprovalVerdict =
  /** The approval may be saved; `usesReserve` is whether the check made now needs the reserve (and the head confirmed it). */
  | { kind: 'OK'; usesReserve: boolean }
  /** Nothing is saved, the step closes and the request goes back to its head, who and the requester are told (`BR-MF1-07c`). */
  | { kind: 'RETURNED'; reasons: ReturnReason[] };

/**
 * What the check made now allows of an approval (`BR-MF1-07c`, `US-06-01` AC-18): blocked, or uses the reserve without the confirmation of
 * the head on the step that is open, and it goes back to the head; otherwise it is saved. There is no override: a year with too little money
 * is not accepted with a reason, it is blocked.
 */
export function judgeApproval(
  check: { outcome: BudgetOutcome | null; blockReasons: readonly BlockReason[] },
  confirmed: boolean,
): ApprovalVerdict {
  // A check made now always has an outcome; one without (made before the three outcomes) is never approved on.
  if (check.outcome === null || check.outcome === 'BLOCKED')
    return { kind: 'RETURNED', reasons: [...check.blockReasons] };
  if (check.outcome === 'USES_RESERVE' && !confirmed) return { kind: 'RETURNED', reasons: ['RESERVE_UNCONFIRMED'] };

  return { kind: 'OK', usesReserve: check.outcome === 'USES_RESERVE' };
}

/**
 * What the decision of the spend step is written as (`US-06-01` AC-2, AC-4, AC-5): the role the person decided in — always the spending
 * approver, nobody decides in their place any more (`QĐ-93c`) — the state the request goes to, and the audit entry. An approval goes to
 * be carried out, a refusal ends the request.
 */
export function spendDecisionRecordOf(
  of: {
    request: { id: string };
    step: { id: string; samePersonAsSpend: boolean };
  },
  decided: {
    decision: 'APPROVED' | 'REJECTED';
    checkId: string | null;
    reason: string | null;
    /** The check the approval is on needed the reserve, and the line of reason the head gave when they confirmed it. */
    usesReserve: boolean;
    reserveReason: string | null;
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
      usesReserve: decided.usesReserve,
      reserveReason: decided.reserveReason,
      samePersonAsSpend: of.step.samePersonAsSpend,
      requestState,
    },
  };
}
