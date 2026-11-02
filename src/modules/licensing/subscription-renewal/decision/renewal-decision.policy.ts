import type { BusinessDate } from '../../../../core/business-date';
import type { RenewalProblem } from '../subscription-renewal.errors';
import type { DeciderRole, ExecutionPoint, RenewalChoice } from '../subscription-renewal.types';

/**
 * Who decides a renewal now (`FR-3.13`, `QĐ-93d`(1)): the person who decides spending, and nobody in their place. When that person is
 * a party to the case because they proposed it (data of before `QĐ-93`) nobody decides it, and the same when the role has no holder who
 * works.
 */
export function renewalDeciderOf(
  spendingApproverEmployeeId: string | null,
  proposerEmployeeId: string,
): { employeeId: string | null; role: Extract<DeciderRole, 'SPENDING_APPROVER'> } {
  const approverIsParty = spendingApproverEmployeeId === proposerEmployeeId;

  return { employeeId: approverIsParty ? null : spendingApproverEmployeeId, role: 'SPENDING_APPROVER' };
}

/** What a case that waits for its decision waits for when nobody who works holds the role of the spending approver (`US-11-02` AC-23). */
export function renewalWaitingReason(
  state: 'PROPOSED' | 'DECIDED' | 'OUTCOME_RECORDED',
  usableSpendingApproverEmployeeId: string | null,
): 'NO_SPENDING_APPROVER' | null {
  return state === 'PROPOSED' && usableSpendingApproverEmployeeId === null ? 'NO_SPENDING_APPROVER' : null;
}

/**
 * Whether the caller may decide: only the decider of the case, never the one who proposed it (`SoD-3`, `SoD-5`), and only a case
 * that waits for its decision. The first reason is the one told.
 */
export function checkDecider(facts: {
  actorEmployeeId: string;
  deciderEmployeeId: string | null;
  proposerEmployeeId: string;
  waitingForDecision: boolean;
}): RenewalProblem | null {
  if (facts.deciderEmployeeId === null || facts.actorEmployeeId !== facts.deciderEmployeeId) return 'NOT_DECIDER';
  if (facts.actorEmployeeId === facts.proposerEmployeeId) return 'NOT_DECIDER';

  return facts.waitingForDecision ? null : 'NOT_AWAITING_DECISION';
}

/**
 * A reduction names a number of seats below what is bought; a renewal as it is and a cancellation name none. Reducing within the
 * paid period is only a reduction, and only for a subscription that allows one mid-term (`FR-1.3`).
 */
export function checkChoice(input: {
  choice: RenewalChoice;
  quantity: number | null;
  purchasedQuantity: number | null;
  withinCurrentTerm: boolean;
  allowsMidTermReduction: boolean;
}): RenewalProblem | null {
  if (input.choice !== 'REDUCE') {
    if (input.quantity !== null) return 'QUANTITY_INVALID';

    return input.withinCurrentTerm ? 'MID_TERM_NOT_ALLOWED' : null;
  }
  if (input.quantity === null || input.quantity < 0) return 'QUANTITY_INVALID';
  if (input.purchasedQuantity !== null && input.quantity >= input.purchasedQuantity) return 'QUANTITY_INVALID';

  return input.withinCurrentTerm && !input.allowsMidTermReduction ? 'MID_TERM_NOT_ALLOWED' : null;
}

/**
 * When the decision is carried out (`QĐ-62k`(i), `US-11-02` AC-10, AC-19): before the milestone, as planned for the renewal; after
 * it the decision is never voided and is carried out mid-term when the subscription allows a reduction mid-term, else at the next
 * renewal. A reduction asked within the paid period is mid-term whenever it is decided.
 */
export function executionPointOf(input: {
  decidedOn: BusinessDate;
  baseDate: BusinessDate;
  allowsMidTermReduction: boolean;
  withinCurrentTerm: boolean;
}): { afterDeadline: boolean; point: ExecutionPoint } {
  const afterDeadline = input.decidedOn > input.baseDate;
  if (input.withinCurrentTerm) return { afterDeadline, point: 'MID_TERM' };
  if (!afterDeadline) return { afterDeadline, point: 'AS_PLANNED' };

  return { afterDeadline, point: input.allowsMidTermReduction ? 'MID_TERM' : 'NEXT_RENEWAL' };
}

/**
 * Whether the decision creates, raises or extends what is owed into a new period, which needs the owner department to have a
 * Cost Center in use (`QĐ-88a`, `QĐ-89d`, `US-11-02` AC-22): a renewal as it is, and a reduction whose remaining seats go on into
 * the next period. A cancellation, a reduction to zero and a reduction within the paid period owe nothing new.
 */
export function needsChargeableOwner(input: {
  choice: RenewalChoice;
  quantity: number | null;
  withinCurrentTerm: boolean;
}): boolean {
  if (input.choice === 'RENEW') return true;
  if (input.choice === 'CANCEL') return false;

  return (input.quantity ?? 0) > 0 && !input.withinCurrentTerm;
}

/** How many seats in use must be chosen for revocation: the seats above the new number when reducing, none otherwise. */
export function seatsToRelease(choice: RenewalChoice, quantity: number | null, seatsInUse: number): number {
  if (choice !== 'REDUCE' || quantity === null) return 0;

  return Math.max(0, seatsInUse - quantity);
}

/**
 * The seats the decider chose are exactly as many as must go, all different, each a personal seat in use of the subscription
 * offered by the ranking (`US-11-02` AC-13, AC-20). The system never completes or changes the choice.
 */
export function checkRelease(input: {
  required: number;
  selected: readonly string[];
  offered: ReadonlySet<string>;
}): RenewalProblem | null {
  const distinct = new Set(input.selected);
  if (distinct.size !== input.selected.length || distinct.size !== input.required) return 'EXCESS_SELECTION_INVALID';
  for (const id of distinct) if (!input.offered.has(id)) return 'EXCESS_SELECTION_INVALID';

  return null;
}
