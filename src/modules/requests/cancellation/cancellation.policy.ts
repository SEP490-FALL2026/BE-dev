import {
  ENDED_STATES,
  NOT_OPEN_FOR_LEAVER,
  type AccessRequestKind,
  type AccessRequestState,
  type CancellationRefusal,
} from '../access-request/access-request.types';

export interface CancellationFacts {
  type: AccessRequestKind;
  state: AccessRequestState;
  /** The people the request is for. */
  beneficiaryEmployeeIds: readonly string[];
  /** Whether each of them has left (`TERMINATED`); a person who is handing over has not. */
  beneficiaryLeft: ReadonlyMap<string, boolean>;
}

/** Whether a request is still open: not at an end of its own and not waiting for the IT Admin to close it as withdrawn. */
export function isOpenForLeaver(state: AccessRequestState): boolean {
  return !NOT_OPEN_FOR_LEAVER.includes(state);
}

/** Whether the request, not yet ended, may be closed because the person it is for left; null when it may. */
export function checkCancellation(facts: CancellationFacts): CancellationRefusal | null {
  if (ENDED_STATES.includes(facts.state)) return 'ALREADY_ENDED';
  if (facts.state === 'AWAITING_IT_CLOSE') return 'WITHDRAWAL_PENDING';
  if (facts.type === 'GROUP_GRANT' || facts.beneficiaryEmployeeIds.length !== 1) return 'GROUP_REQUEST_UNSUPPORTED';
  if (facts.beneficiaryLeft.get(facts.beneficiaryEmployeeIds[0]) !== true) return 'BENEFICIARY_NOT_LEFT';

  return null;
}

/** Whether a person was transferred away from the department a request was sent from: they still work, and sit elsewhere now. */
export function wasTransferredFrom(facts: {
  status: string;
  currentDepartmentId: string | null;
  sentFromDepartmentId: string;
}): boolean {
  return (
    facts.status === 'ACTIVE' &&
    facts.currentDepartmentId !== null &&
    facts.currentDepartmentId !== facts.sentFromDepartmentId
  );
}

export interface TransferCancellationFacts {
  type: AccessRequestKind;
  state: AccessRequestState;
  beneficiaryEmployeeIds: readonly string[];
  /**
   * Whether each of them was transferred: still works, and sits in a department other than the one the request was sent from (a paid
   * request keeps that department, `QĐ-90b`). A person who left was not transferred: their request closes as `BENEFICIARY_LEFT`.
   */
  beneficiaryTransferred: ReadonlyMap<string, boolean>;
}

/**
 * Whether the request, not yet granted, may be closed because the person it is for was transferred; null when it may. The
 * same order of answers as `checkCancellation`; a request for access of one person is the only one closed this way (a request for a
 * group closes one line at a time, a service account follows the department that owns it, a renewal leaves the seat to the review
 * of the transfer). A grant that is done is not closed here: the request is completed, and the right goes to the held rights.
 */
export function checkTransferCancellation(facts: TransferCancellationFacts): CancellationRefusal | null {
  if (ENDED_STATES.includes(facts.state)) return 'ALREADY_ENDED';
  if (facts.state === 'AWAITING_IT_CLOSE') return 'WITHDRAWAL_PENDING';
  if (facts.type === 'GROUP_GRANT' || facts.beneficiaryEmployeeIds.length !== 1) return 'GROUP_REQUEST_UNSUPPORTED';
  if (facts.type !== 'GRANT') return 'BENEFICIARY_NOT_TRANSFERRED';
  if (facts.beneficiaryTransferred.get(facts.beneficiaryEmployeeIds[0]) !== true) return 'BENEFICIARY_NOT_TRANSFERRED';

  return null;
}
