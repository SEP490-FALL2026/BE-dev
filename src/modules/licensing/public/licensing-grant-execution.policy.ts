import { availableDecisions } from '../provisioning/failure.policy';
import type { ProvisioningChannel, ProvisioningTaskStatus } from './licensing.types';

/** What an IT Admin may do next on the grant task of one person: the button each state of the task shows. */
export type GrantExecutionAction =
  'CLAIM' | 'COMPLETE' | 'REPORT_FAILURE' | 'RETRY' | 'HAND_OFF' | 'CLOSE_FAILED' | 'CANCEL';

/**
 * The next acts on a grant task, from its state and channel and from whether the requester withdrew the request while the grant had
 * failed (`US-05-08` AC-9): a task by hand is taken, then completed with evidence or reported as not done; a failed one gets the three
 * decisions of the failure handling (a manual task cannot be handed off), and once the request is withdrawn only the cancellation is
 * left. A connector task that works by itself, one waiting for its retry and one that is over offer nothing. Pure: `withdrawing` is the
 * request's own fact, not the task's.
 */
export function grantExecutionActions(
  task: { status: ProvisioningTaskStatus; channel: ProvisioningChannel },
  withdrawing: boolean,
): GrantExecutionAction[] {
  if (task.status === 'FAILED') return withdrawing ? ['CANCEL'] : availableDecisions(task.status, task.channel);
  if (task.channel !== 'MANUAL') return [];
  if (task.status === 'QUEUED') return ['CLAIM'];
  if (task.status === 'IN_PROGRESS') return ['COMPLETE', 'REPORT_FAILURE'];

  return [];
}
