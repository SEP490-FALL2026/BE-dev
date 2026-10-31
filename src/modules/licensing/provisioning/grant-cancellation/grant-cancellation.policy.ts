import { WITHDRAWAL_CANCEL_REASON, type ProvisioningTaskStatus } from '../../public/licensing.types';
import {
  BENEFICIARY_LEFT_CANCEL_REASON,
  BENEFICIARY_TRANSFERRED_CANCEL_REASON,
  type GrantCancelCause,
} from '../../public/licensing-open-grants.types';

/**
 * What cancelling the grant of a request does to its task, by the state the task is in and why the request ends (`US-05-08` AC-3,
 * AC-5, AC-9; `US-03-04` AC-25). A task nobody has worked is cancelled with its assignment. A task that failed is cancelled by
 * the IT Admin who closes a request whose beneficiary left or was transferred, and waits for the IT Admin when the requester
 * withdrew. A task being worked is cancelled only for a beneficiary who left or was transferred, and only with the evidence that the
 * IT Admin took the invitation back or stopped the work (confirmed with the vendor): the work is not done by this call, so the
 * person says it is undone. A task that is done cannot be cancelled: the seat is real, and a person who holds a real entitlement is
 * never closed as cancelled.
 *
 * For a beneficiary who was transferred that confirmation is asked for every task that is open, whatever its state (queued, waiting
 * for its retry, failed or being worked): the vendor may already have sent the invitation, so the grant task of a transferred person
 * is cancelled only after the IT Admin confirmed the check with the vendor. A person who left, and a requester who
 * withdrew, are judged as before.
 */
export type GrantCancelAction =
  | 'CANCEL'
  /** The task is being worked and the request is withdrawn: ask again when it has a result. */
  | 'RUNNING'
  | 'EVIDENCE_REQUIRED'
  /** The task failed and the requester withdrew: the IT Admin closes it as cancelled, and only then does the request end. */
  | 'WAIT_FOR_IT_ADMIN'
  | 'COMPLETED'
  | 'ENDED';

/** The reason a task keeps when it is cancelled for this cause (a text of the task, not a value of an enum). */
export function cancelReasonOf(cause: GrantCancelCause): string {
  switch (cause) {
    case 'BENEFICIARY_LEFT':
      return BENEFICIARY_LEFT_CANCEL_REASON;
    case 'BENEFICIARY_TRANSFERRED':
      return BENEFICIARY_TRANSFERRED_CANCEL_REASON;
    case 'REQUESTER_WITHDREW':
      return WITHDRAWAL_CANCEL_REASON;
  }
}

export function grantCancelAction(
  status: ProvisioningTaskStatus,
  cause: GrantCancelCause,
  hasEvidence: boolean,
): GrantCancelAction {
  // A task of a transferred beneficiary that is open, in any state, is cancelled only on the confirmation of the check with the vendor.
  const vendorCheckMissing = cause === 'BENEFICIARY_TRANSFERRED' && !hasEvidence;
  switch (status) {
    case 'QUEUED':
    case 'RETRY_SCHEDULED':
      return vendorCheckMissing ? 'EVIDENCE_REQUIRED' : 'CANCEL';
    case 'FAILED':
      if (cause === 'REQUESTER_WITHDREW') return 'WAIT_FOR_IT_ADMIN';

      return vendorCheckMissing ? 'EVIDENCE_REQUIRED' : 'CANCEL';
    case 'IN_PROGRESS':
      if (cause === 'REQUESTER_WITHDREW') return 'RUNNING';

      return hasEvidence ? 'CANCEL' : 'EVIDENCE_REQUIRED';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CLOSED_FAILED':
    case 'CANCELLED':
      return 'ENDED';
  }
}
