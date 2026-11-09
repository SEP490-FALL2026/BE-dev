/**
 * Why the grant of a request is cancelled: the requester withdrew it (`US-05-08`), the person it was for left (`US-03-04` AC-25) or
 * was transferred to another department (`QĐ-89b`: the IT Admin closes the part not yet granted, with evidence).
 */
export type GrantCancelCause = 'REQUESTER_WITHDREW' | 'BENEFICIARY_LEFT' | 'BENEFICIARY_TRANSFERRED';

/** The reason kept on a task that was cancelled because the person it was for left. */
export const BENEFICIARY_LEFT_CANCEL_REASON = 'BENEFICIARY_LEFT';

/** The reason kept on a task that was cancelled because the person it was for was transferred to another department. */
export const BENEFICIARY_TRANSFERRED_CANCEL_REASON = 'BENEFICIARY_TRANSFERRED';

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

/**
 * A seat that a request stands for and that is still held on a day, read along the chain of records that carried it (`predecessor_id`: a
 * handover of a service account, a renewal, a seat carried to a renewed subscription): the record of the chain that runs now (the last one),
 * the person, when it is expected to end (the day the request named) and when its period closes (exclusive; null while it is open), and the
 * department that owns it now. What the commitment of 01/01 counts a request's seats from (`BR-MF1-09e`).
 */
export interface GrantedSeatOfRequest {
  requestId: string;
  /** The record the request made or named: the one of its grant, or the one that follows the renewed record. */
  rootAssignmentId: string;
  /** The records that followed the root, in order, up to the one that runs now; empty when the root is the one that runs. */
  laterAssignmentIds: string[];
  /** The record that runs now: the last of the chain. */
  assignmentId: string;
  employeeId: string;
  planId: string;
  owningDepartmentId: string | null;
  expectedEndDate: string | null;
  validUntil: string | null;
}

/** Where the seats of requests are read from: the grants of these requests, and records a request names itself (the record that follows a renewed one). */
export interface SeatRootsOfRequests {
  grantRequestIds: readonly string[];
  namedRoots: readonly { requestId: string; assignmentId: string }[];
}
