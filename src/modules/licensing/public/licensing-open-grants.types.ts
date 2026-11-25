import type { ProvisioningChannel, ProvisioningTaskStatus } from './licensing.types';

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

/** Who completed the grant task of a request and when: the account of the IT Admin, a value that outlives the account. */
export interface GrantCompletion {
  completedByAppUserId: string | null;
  completedAt: Date;
}

/**
 * The grant task of one person of a request, as the queue of grants shows where the grant stands: the task, its state and channel, and why
 * it failed. A request for one person has one; a request for a group has one for each person granted. The newest first when a person has
 * had more than one (a failed task tried again is the same task, so only a request made again has two).
 */
export interface GrantExecution {
  requestId: string;
  /** The person the seat was given to: the holder of the assignment the task answers for. */
  employeeId: string;
  taskId: string;
  status: ProvisioningTaskStatus;
  channel: ProvisioningChannel;
  failureReason: string | null;
  /** The account of the IT Admin who took the task; null while nobody has (the same value as `claimedBy` of the task). */
  claimedByAppUserId: string | null;
  createdAt: Date;
}

/** A completed grant task that topped up a shared pool when fulfilling a request (`POOL_TOP_UP`). */
export interface PoolTopUpPurchase {
  taskId: string;
  purchasedAt: Date | null;
}

/** One holder segment along the chain of a K1 annual assignment (initial grant, handover, or transfer replacement). */
export interface K1AnnualHolderSegment {
  assignmentId: string;
  requestId: string | null;
  owningDepartmentId: string | null;
  billingAnchorOn: string | null;
  endedOn: string | null;
  replacedFromAssignmentId: string | null;
}

/** Timeline of a K1 annual right starting at `rootAssignmentId`, used for advisory locks and post-transfer confirmations. */
export interface K1AnnualHolderTimeline {
  rootAssignmentId: string;
  segments: K1AnnualHolderSegment[];
}

/** Closed non-replaced K1 annual seat that may still have an active paid 12-month cycle crossing `onDate` (`F9(c)`). */
export interface K1AnnualPaidSeat extends GrantedSeatOfRequest {
  personalCommitmentMonths: 12;
  billingAnchorOn: string;
}
