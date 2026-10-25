import type { AccessRequestBranchCode } from './access-request.policy';

/**
 * The rules of deciding the need step (`US-05-04`), as pure decisions: who may decide it and when, what a long term
 * needs, and what the decision leads to. Nobody but the person the routing table gave the step decides it (`BR-13.4`),
 * and nobody decides a request they asked or are given (`SoD-4`).
 */

/** A term longer than this needs the person who decides to confirm it in so many words (`BR-07.4`, `OI-07a`). */
export const LONG_TERM_MONTHS = 12;

export interface DecisionFacts {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  /** Who holds the need step; null while it waits for somebody. */
  assigneeEmployeeId: string | null;
  stepState: 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'CLOSED';
  termMonths: number;
}

/** What a head gives with the approval of a request that costs money (`US-05-04` AC-12, AC-16). */
export interface SpendInput {
  /** A line of the plan, or null when the request is outside it. */
  planLine: { position: number; stillNeeded: boolean } | null;
  expectedSpendOn?: string;
}

export interface DecisionInput {
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
  termConfirmationReason?: string;
  spend?: SpendInput;
}

export type DecisionRefusal = 'OWN_REQUEST' | 'NOT_THE_ASSIGNEE' | 'STEP_NOT_PENDING' | 'TERM_CONFIRMATION_REQUIRED';

/** The first reason the person may not decide the step, in the order a caller should learn it, or null when they may. */
export function checkNeedDecision(facts: DecisionFacts, input: DecisionInput): DecisionRefusal | null {
  if (
    facts.actorEmployeeId === facts.requesterEmployeeId ||
    facts.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)
  ) {
    return 'OWN_REQUEST';
  }
  if (facts.assigneeEmployeeId === null || facts.actorEmployeeId !== facts.assigneeEmployeeId)
    return 'NOT_THE_ASSIGNEE';
  if (facts.stepState !== 'PENDING') return 'STEP_NOT_PENDING';
  const confirmed = (input.termConfirmationReason ?? '').trim() !== '';
  if (input.decision === 'APPROVE' && facts.termMonths > LONG_TERM_MONTHS && !confirmed) {
    return 'TERM_CONFIRMATION_REQUIRED';
  }

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

export type DeciderRole = 'MANAGER' | 'SPENDING_APPROVER' | 'FALLBACK_APPROVER';

/**
 * The role a person decided in, from the row of the routing table that gave them the step (`US-05-03`): the roles can
 * change after the request is sent, so the record keeps the role as it stood. A row that gives the step to nobody (8)
 * has no decider.
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
    case 3:
    case 4:
      return 'FALLBACK_APPROVER';
    default:
      throw new Error(`The routing row ${routingRow} gives the step to nobody, so nobody decides in it.`);
  }
}
