import type { AccessRequestKind, AccessRequestState } from './access-request.types';

/**
 * Why the IT Admin may not close a request because its beneficiary left (`US-03-04` AC-25). The checks run in this order, so a request
 * has one answer; the task of the grant is judged by licensing, in the transaction (`EVIDENCE_REQUIRED` is its answer).
 */
export type CancellationRefusal =
  /** Refused, rejected, completed, failed, withdrawn or already cancelled: nothing is left to close. */
  | 'ALREADY_ENDED'
  /** The requester withdrew and the request waits for the IT Admin to close the task of its grant: that has its own way. */
  | 'WITHDRAWAL_PENDING'
  /**
   * A request for a group with more than one person still live: one of them leaving is not the end of the request, so the IT Admin
   * removes each person who left from their own line. A request whose last live line is the leaver's is that removal.
   */
  | 'GROUP_REQUEST_UNSUPPORTED'
  /** The person it is for still works, handing over included: the request is only listed until they have left. */
  | 'BENEFICIARY_NOT_LEFT';

export interface CancellationFacts {
  type: AccessRequestKind;
  state: AccessRequestState;
  /** The people the request is for. */
  beneficiaryEmployeeIds: readonly string[];
  /** Whether each of them has left (`TERMINATED`); a person who is handing over has not. */
  beneficiaryLeft: ReadonlyMap<string, boolean>;
}

const ENDED: readonly AccessRequestState[] = [
  'REJECTED',
  'IT_REJECTED',
  'COMPLETED',
  'FAILED',
  'WITHDRAWN',
  'CANCELLED',
];

/**
 * The states of a request that is not open for the person it is for who left: at an end of its own, or waiting for the IT Admin to close
 * the task of a withdrawal (that has its own way).
 */
export const NOT_OPEN_FOR_LEAVER: readonly AccessRequestState[] = [...ENDED, 'AWAITING_IT_CLOSE'];

/** Whether a request is still open: not at an end of its own and not waiting for the IT Admin to close it as withdrawn. */
export function isOpenForLeaver(state: AccessRequestState): boolean {
  return !NOT_OPEN_FOR_LEAVER.includes(state);
}

/** Whether the request, not yet ended, may be closed because the person it is for left; null when it may. */
export function checkCancellation(facts: CancellationFacts): CancellationRefusal | null {
  if (ENDED.includes(facts.state)) return 'ALREADY_ENDED';
  if (facts.state === 'AWAITING_IT_CLOSE') return 'WITHDRAWAL_PENDING';
  if (facts.type === 'GROUP_GRANT' || facts.beneficiaryEmployeeIds.length !== 1) return 'GROUP_REQUEST_UNSUPPORTED';
  if (facts.beneficiaryLeft.get(facts.beneficiaryEmployeeIds[0]) !== true) return 'BENEFICIARY_NOT_LEFT';

  return null;
}
