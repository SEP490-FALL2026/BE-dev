import type { BusinessDate } from '../../core/business-date';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import type { AssignmentKind, AssignmentSource } from './licensing.types';

/** The seat a renewal is asked for, as it is when it is read under its lock: what the renewal depends on and nothing else. */
export interface AssignmentFacts {
  assignmentId: string;
  employeeId: string;
  planId: string;
  subscriptionId: string | null;
  kind: AssignmentKind;
  source: AssignmentSource;
  effectiveFrom: BusinessDate;
  validUntil: BusinessDate | null;
  expectedEndDate: BusinessDate | null;
  /** Not ended, not failed and not cancelled. */
  open: boolean;
  /** The first day of the records that follow one another without a break up to this one (itself when it follows none). */
  chainStartsOn: BusinessDate;
  /** What the grant it was made for is: none (a baseline row), done, or still to be done or failed. */
  grant: 'NONE' | 'COMPLETED' | 'NOT_COMPLETED';
  /** The request the grant of the seat answered for; null for a seat no grant made. */
  grantRequestId: string | null;
  /** A revocation of it is under way (not closed as failed, not cancelled). */
  revocationLive: boolean;
  /** Another record already follows it. */
  hasSuccessor: boolean;
}

/** What a renewal asks licensing to write: the seat, the end it must still have, the new end, and the request it is done for. */
export interface RenewAssignmentInput {
  assignmentId: string;
  requestId: string;
  /** The end the request was made against: a seat whose end changed since is not renewed. */
  previousExpectedEndDate: BusinessDate;
  newExpectedEndDate: BusinessDate;
  now: Date;
}

/** The renewal that was written: the old record ended on `endsOn`, and the new one begins that day. */
export interface RenewedAssignment {
  previousAssignmentId: string;
  successorAssignmentId: string;
  endsOn: BusinessDate;
}

/**
 * The port the module of requests implements to say whether a seat has a renewal waiting for its decision (`US-05-14` AC-4): the
 * revocation of a right that has reached its end (`g6-time-limited-access`) leaves it alone while one is. The module registers it
 * with `LicensingService.registerRenewalHold` when it starts; until then no seat has one.
 */
export interface RenewalHold {
  hasPendingRenewal(assignmentId: string, tx?: DbTx): Promise<boolean>;
  /**
   * The renewal waiting for its decision of each of these seats, in one read: the queue of the rights that have ended
   * (`g6-time-limited-access`) keeps such an item waiting and shows where its request stands. A seat with none is absent.
   */
  pendingRenewalsOf(assignmentIds: readonly string[], tx?: DbTx): Promise<Map<string, PendingRenewal>>;
}

/** The request for a renewal that has not been decided, as the queue of the rights that have ended shows it. */
export interface PendingRenewal {
  requestId: string;
  /** The state of the request, as the module of requests names it. */
  state: string;
}
