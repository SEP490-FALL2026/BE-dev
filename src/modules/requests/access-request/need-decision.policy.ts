import type { AccessRequestBranchCode } from './access-request.policy';

/**
 * The rules of deciding the need step (`US-05-04`), as pure decisions: who may decide it and when, what a long term
 * needs, and what the decision leads to. Nobody but the person the routing table gave the step decides it (`BR-13.4`),
 * and nobody decides a request they asked or are given (`SoD-4`).
 */

export interface DecisionFacts {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  /** Who holds the need step; null while it waits for somebody. */
  assigneeEmployeeId: string | null;
  stepState: 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'CLOSED' | 'NOT_REQUIRED';
}

export interface DecisionInput {
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}

export type DecisionRefusal = 'OWN_REQUEST' | 'NOT_THE_ASSIGNEE' | 'STEP_NOT_PENDING';

/** The first reason the person may not decide the step, in the order a caller should learn it, or null when they may. */
export function checkNeedDecision(facts: DecisionFacts): DecisionRefusal | null {
  if (
    facts.actorEmployeeId === facts.requesterEmployeeId ||
    facts.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)
  ) {
    return 'OWN_REQUEST';
  }
  if (facts.assigneeEmployeeId === null || facts.actorEmployeeId !== facts.assigneeEmployeeId)
    return 'NOT_THE_ASSIGNEE';
  if (facts.stepState !== 'PENDING') return 'STEP_NOT_PENDING';

  return null;
}

export type ApprovedRequestState = 'AWAITING_EXECUTION' | 'AWAITING_IT_ASSESSMENT' | 'AWAITING_SPEND_SUBMISSION';

/**
 * Where an approved request goes next: the IT Admin for internal software, the assessment of the IT Admin for software
 * that is not in the catalog, the head's spend submission for paid software.
 */
export const nextRequestState = (branch: AccessRequestBranchCode): ApprovedRequestState =>
  branch === 'INTERNAL_FREE'
    ? 'AWAITING_EXECUTION'
    : branch === 'NEW_SOFTWARE'
      ? 'AWAITING_IT_ASSESSMENT'
      : 'AWAITING_SPEND_SUBMISSION';

/** The role a decision is recorded in from now on; the approver of last resort is gone (`QĐ-93c`), and what was recorded stays readable. */
export type DeciderRole = 'MANAGER' | 'SPENDING_APPROVER';

/**
 * The role a person decided in, from the row of the routing table that gave them the step (`US-05-03`): the roles can
 * change after the request is sent, so the record keeps the role as it stood. A row that gives the step to nobody (3, 4, 8) has
 * no decider, and throws: no step is held on such a row (the queue lists only the rows of `HELD_ROUTING_ROWS`).
 */
export function deciderRoleOf(routingRow: number): DeciderRole {
  switch (routingRow) {
    // The head (1), the head who sent for others (5) or who decides the lines of a group an Employee sent (9).
    case 1:
    case 5:
    case 9:
      return 'MANAGER';
    case 2:
      return 'SPENDING_APPROVER';
    default:
      throw new Error(`The routing row ${routingRow} gives the step to nobody, so nobody decides in it.`);
  }
}

export interface NeedDecisionOutcome {
  approved: boolean;
  /** Where the request goes: the next state of its branch for an approval, `REJECTED` for a refusal. */
  requestState: ApprovedRequestState | 'REJECTED';
  deciderRole: DeciderRole;
}

/**
 * What a decision leads to, once it is allowed (`US-05-04` AC-12, AC-16): the state the request goes to, the role the person decided
 * in (the row of the routing table as it stood). Throws for a row that gives
 * the step to nobody.
 */
export function needDecisionOutcome(
  asked: { branch: AccessRequestBranchCode; routingRow: number },
  input: DecisionInput,
): NeedDecisionOutcome {
  const approved = input.decision === 'APPROVE';
  const deciderRole = deciderRoleOf(asked.routingRow);
  if (deciderRole === null) {
    throw new Error(
      `The routing row ${asked.routingRow} is a legacy row: its step is frozen, so nobody decides in it.`,
    );
  }

  return {
    approved,
    requestState: approved ? nextRequestState(asked.branch) : 'REJECTED',
    deciderRole,
  };
}
