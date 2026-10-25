import type { ProvisioningTaskStatus } from '../licensing.types';
import type { GrantCancelCause } from '../licensing-open-grants.types';

/**
 * What cancelling the grant of a request does to its task, by the state the task is in and why the request ends (`US-05-08` AC-3,
 * AC-5, AC-9; `US-03-04` AC-25). A task nobody has worked is cancelled with its assignment. A task that failed is cancelled by the IT
 * Admin who closes a request whose beneficiary left, and waits for the IT Admin when the requester withdrew. A task being worked is
 * cancelled only for a beneficiary who left, and only with the evidence that the IT Admin took the invitation back or stopped the
 * work: the work is not done by this call, so the person says it is undone. A task that is done cannot be cancelled: the seat is real.
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

export function grantCancelAction(
  status: ProvisioningTaskStatus,
  cause: GrantCancelCause,
  hasEvidence: boolean,
): GrantCancelAction {
  switch (status) {
    case 'QUEUED':
    case 'RETRY_SCHEDULED':
      return 'CANCEL';
    case 'FAILED':
      return cause === 'BENEFICIARY_LEFT' ? 'CANCEL' : 'WAIT_FOR_IT_ADMIN';
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
