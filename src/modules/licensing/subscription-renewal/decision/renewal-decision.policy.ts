import type { BusinessDate } from '../../../../core/business-date';
import type { RenewalProblem } from '../subscription-renewal.errors';
import type { DeciderRole, ExecutionPoint, RenewalChoice } from '../subscription-renewal.types';

/**
 * Who confirms a renewal now (`QĐ-94d`(2), `QĐ-96g`): the head the department that owns the subscription has on the day of the
 * decision, whatever role their account holds, and nobody in their place. When that head is also the one who proposed the case
 * (the IT Admin who heads the owner department) nobody confirms it (`SoD-3`), and the same when the department has no head.
 */
export function renewalDeciderOf(
  ownerHeadEmployeeId: string | null,
  proposerEmployeeId: string,
): { employeeId: string | null; role: Extract<DeciderRole, 'OWNER_DEPARTMENT_HEAD'> } {
  const headIsParty = ownerHeadEmployeeId === proposerEmployeeId;

  return { employeeId: headIsParty ? null : ownerHeadEmployeeId, role: 'OWNER_DEPARTMENT_HEAD' };
}

/** What a case that waits for its confirmation waits for when the owner department has no head today (`US-11-05` AC-23). */
export function renewalWaitingReason(
  state: 'PROPOSED' | 'DECIDED' | 'OUTCOME_RECORDED' | 'STALE',
  ownerHeadEmployeeId: string | null,
): 'NO_HEAD' | null {
  return state === 'PROPOSED' && ownerHeadEmployeeId === null ? 'NO_HEAD' : null;
}

/**
 * Whether the caller may confirm: only the head of the owner department today, never the one who proposed it (`SoD-3`, `SoD-5`),
 * and only a case that waits for its confirmation. The first reason is the one told.
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
 * When the decision is carried out (`QĐ-62k`(i), `US-11-02` AC-10, AC-19): before the milestone, as planned for the renewal; after
 * it the decision is never voided and is carried out mid-term when the subscription allows a reduction mid-term, else at the next
 * renewal. The day is the day of the confirmation; the IT Admin does not choose a point (`QĐ-96f`).
 */
export function executionPointOf(input: {
  decidedOn: BusinessDate;
  baseDate: BusinessDate;
  allowsMidTermReduction: boolean;
}): { afterDeadline: boolean; point: ExecutionPoint } {
  const afterDeadline = input.decidedOn > input.baseDate;
  if (!afterDeadline) return { afterDeadline, point: 'AS_PLANNED' };

  return { afterDeadline, point: input.allowsMidTermReduction ? 'MID_TERM' : 'NEXT_RENEWAL' };
}

/** How many seats in use must be chosen for revocation: the seats above the new number when reducing, none otherwise. */
export function seatsToRelease(choice: RenewalChoice, quantity: number | null, seatsInUse: number): number {
  if (choice !== 'REDUCE' || quantity === null) return 0;

  return Math.max(0, seatsInUse - quantity);
}

/**
 * The seats the IT Admin chose are exactly as many as must go, all different, each a personal seat in use of the subscription
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

/**
 * Whether the seats proposed still match what must go at the day of the confirmation: the ones still held are exactly as many as
 * are required now (a seat that ended since, or one more seat in use, makes the proposal out of date: the IT Admin proposes again).
 */
export function proposalIsStale(input: { required: number; stillHeld: number }): boolean {
  return input.required !== input.stillHeld;
}
