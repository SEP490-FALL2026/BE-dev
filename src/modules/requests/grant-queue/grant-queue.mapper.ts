import { grantExecutionActions } from '../../licensing/public/licensing-grant-execution.policy';
import type { GrantExecution } from '../../licensing/public/licensing-open-grants.types';
import type { GrantQueueItemWire } from './grant-queue.dto';

/**
 * The grant task of the person a row is for, as the row shows it: the newest task of the request, or, for a request for a group, the newest
 * task whose seat is the person's. Null when there is none (the grant has not begun, or the request ended without a task). `executions` are
 * the tasks of the request, newest first. A row whose requester withdrew while the grant had failed offers only the cancellation.
 */
export function executionOf(
  row: { type: 'GRANT' | 'SERVICE_ACCOUNT' | 'GROUP_GRANT'; beneficiaryEmployeeId: string; withdrawing: boolean },
  executions: readonly GrantExecution[],
): GrantQueueItemWire['execution'] {
  // A service account is held by the person the IT Admin named, who may not be the one the request names.
  const task = executions.find(
    (candidate) => row.type !== 'GROUP_GRANT' || candidate.employeeId === row.beneficiaryEmployeeId,
  );
  if (!task) return null;

  return {
    taskId: task.taskId,
    status: task.status,
    failureReason: task.failureReason,
    availableActions: grantExecutionActions(task, row.withdrawing),
  };
}
