import type { ProvisioningTaskStatus, WithdrawnRevocation } from '../../public/licensing.types';

const ENDED: readonly ProvisioningTaskStatus[] = ['COMPLETED', 'CLOSED_FAILED', 'CANCELLED'];

/** A task that is done, closed or cancelled has nothing left to take back. */
export const isEnded = (status: ProvisioningTaskStatus): boolean => ENDED.includes(status);

/**
 * What taking one reason back does to the task (`BR-MF5-04`, `US-07-05` AC-22): it goes on while another reason stands; with none left a
 * task that waits or failed is cancelled as no longer applying, and one in progress only when the IT Admin who took it is the one who
 * asks (nobody takes the work of another away), otherwise it is left to the IT Admin to close.
 */
export function withdrawalOutcome(input: {
  status: ProvisioningTaskStatus;
  remaining: number;
  claimedBy: string | null;
  cancelInProgressClaimedBy: string | undefined;
}): Exclude<WithdrawnRevocation['outcome'], 'ALREADY_ENDED' | 'NOT_FOUND'> {
  if (input.remaining > 0) return 'CONTINUES';
  if (input.status !== 'IN_PROGRESS') return 'CANCELLED';

  return input.cancelInProgressClaimedBy !== undefined && input.cancelInProgressClaimedBy === input.claimedBy
    ? 'CANCELLED'
    : 'IT_ADMIN_TO_CLOSE';
}
