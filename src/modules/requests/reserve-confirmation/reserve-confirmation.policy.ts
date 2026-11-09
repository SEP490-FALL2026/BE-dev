/**
 * Who may confirm that a request uses the reserve, and when a confirmation is wanted (`BR-MF1-06h`, `QT 1.6`), as pure decisions. Only the
 * head of the department of the request confirms, with a line of reason; the head never confirms what is asked for them, since the person
 * who asks a decision on a request is not the one who decides it.
 */

export type ConfirmerRefusal =
  /** The caller does not head the department of the request now. */
  | 'NOT_HEAD'
  /** The head is the one who asked for the request or one it is for. */
  | 'CONFIRMER_IS_BENEFICIARY';

export function checkConfirmer(facts: {
  actorEmployeeId: string;
  /** The department the caller heads today, or null when they head none. */
  headedDepartmentId: string | null;
  requestDepartmentId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
}): ConfirmerRefusal | null {
  if (facts.headedDepartmentId === null || facts.headedDepartmentId !== facts.requestDepartmentId) return 'NOT_HEAD';
  // A request for a group is the head's own act for their people, so the head who sent it confirms it (`BR-MF1-06h`); only a head who is
  // one of the people the request is for is a party to it.
  if (facts.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)) return 'CONFIRMER_IS_BENEFICIARY';

  return null;
}

/**
 * Whether the request waits for the confirmation of the reserve: it is in the queue of its head, its newest check uses the reserve and no
 * spend step is open. A request that was sent back or checked again (a new check) is judged on that check.
 */
export function awaitsReserveConfirmation(facts: {
  state: string;
  newestCheckOutcome: 'WITHIN_BASE' | 'USES_RESERVE' | 'BLOCKED' | null;
  hasOpenSpendStep: boolean;
}): boolean {
  return (
    facts.state === 'AWAITING_SPEND_SUBMISSION' &&
    facts.newestCheckOutcome === 'USES_RESERVE' &&
    !facts.hasOpenSpendStep
  );
}
