/** Why the grant of a request is cancelled: the requester withdrew it (`US-05-08`), or the person it was for left (`US-03-04` AC-25). */
export type GrantCancelCause = 'REQUESTER_WITHDREW' | 'BENEFICIARY_LEFT';

/** The reason kept on a task that was cancelled because the person it was for left. */
export const BENEFICIARY_LEFT_CANCEL_REASON = 'BENEFICIARY_LEFT';

/** The states of a grant task that is not finished: the work is still to be done, is being done, or failed and waits for a decision. */
export const OPEN_GRANT_TASK_STATUSES = ['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'FAILED'] as const;

/** A grant of a person that is not finished (`US-03-04` AC-24): the task, the request it answers for and the plan. */
export interface OpenGrantTask {
  taskId: string;
  status: (typeof OPEN_GRANT_TASK_STATUSES)[number];
  requestId: string | null;
  assignmentId: string;
  plan: { planId: string; planName: string; applicationId: string; applicationName: string };
  createdAt: Date;
}
