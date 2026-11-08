import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AssignmentService } from '../assignment/assignment.service';
import { ProvisioningFailureService, type FailureRecorded } from '../provisioning/provisioning-failure.service';
import {
  ProvisioningCancellationService,
  type GrantCancelInput,
} from '../provisioning/grant-cancellation/provisioning-cancellation.service';
import { ProvisioningTaskFrame } from '../provisioning/provisioning-task-frame.service';
import { RevocationViewService } from '../provisioning/revocation-view.service';
import { RevocationService } from '../provisioning/revocation.service';
import type {
  AssignmentRecord,
  GrantCancellation,
  HeldSoftware,
  OpenedRevocation,
  OpenRevocationInput,
  PersonalSeat,
  ProvisioningFailureKind,
  RevocationSource,
  SelfExecutionMode,
  TerminatingAccess,
} from './licensing.types';

/**
 * The licensing facade other modules call for the revocation of personal seats, the grant task of a request, the failures of the
 * connector, and the seats a person holds. The rules of the seats themselves live behind it.
 */
@Injectable()
export class LicensingApi {
  constructor(
    private readonly assignments: AssignmentService,
    private readonly provisioningFailures: ProvisioningFailureService,
    private readonly cancellations: ProvisioningCancellationService,
    private readonly frame: ProvisioningTaskFrame,
    private readonly revocations: RevocationService,
    private readonly revocationView: RevocationViewService,
  ) {}

  /**
   * The one gate that opens the revocation of a personal seat, for every source (a return, a departure, a transfer review, an
   * expiry, a reduced or cancelled subscription...): a task of the queue is made, or, when the seat has one already, the
   * reason is added to it. Done in the transaction of the source, which decides who is revoked and why; the seat is given back
   * only when the task is completed. Asking again for the same source and reference changes nothing. Throws
   * RevocationRefusedError, AssignmentNotFoundError, AssignmentNotOpenError, SeatTargetNotFoundError and
   * ProvisioningAnotherItAdminNeededError.
   */
  openRevocation(tx: DbTx, actor: AuthenticatedPrincipal, input: OpenRevocationInput): Promise<OpenedRevocation> {
    return this.revocations.open(tx, actor, input);
  }

  /**
   * The personal seats a person holds on `onDate` or will, with how each is taken away (its kind of provisioning, the note of
   * the plan and whether removal loses data) and the revocation under way: what the list of a departure and the review after a
   * transfer start from. A fixed number of statements however many seats there are.
   */
  listPersonalSeatsOf(employeeId: string, onDate: BusinessDate, tx?: DbTx): Promise<PersonalSeat[]> {
    return this.revocationView.personalSeatsOf(employeeId, onDate, tx);
  }

  /**
   * The software a person holds on `onDate` (personal seats begun, not failed, not cancelled, not ended), oldest first, with how many
   * there are in all: what a department head reads of a member. The page and the count share a snapshot, and the number of
   * statements does not grow with the page.
   */
  pageHeldSoftwareOf(
    employeeId: string,
    onDate: BusinessDate,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: HeldSoftware[]; total: number }> {
    return this.revocationView.heldSoftwareOf(employeeId, onDate, page, tx);
  }

  /** How many seats each of these subscriptions holds on `onDate`, in one statement (the subscriptions with none are absent). */
  countSeatsOfSubscriptions(
    subscriptionIds: readonly string[],
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, number>> {
    return this.revocationView.countSeatsOfSubscriptions(subscriptionIds, onDate, tx);
  }

  /** How many personal seats each of these people holds on `onDate` or will, in one statement (the people with none are absent). */
  countPersonalSeatsOf(employeeIds: readonly string[], onDate: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    return this.revocationView.countPersonalSeats(employeeIds, onDate, tx);
  }

  /**
   * Which of these seats have a revocation under way or done that a source asked for with this reference (the record of its own
   * decision, for example the review a head made), whatever else asked for it too: what tells a source whether the seat it decided
   * about is already being taken back. A revocation that was cancelled or closed as failed does not count. One statement.
   */
  listRevocationsOpenedFor(
    reference: { sources: readonly RevocationSource[]; referenceId: string },
    assignmentIds: readonly string[],
    tx?: DbTx,
  ): Promise<Set<string>> {
    return this.revocationView.openedByReference(reference.sources, reference.referenceId, assignmentIds, tx);
  }

  /**
   * The K1 seats of these people whose renewal is cancelled but whose access runs on to the end of the paid period: the warning
   * that a person who left still has access until a day. A fixed number of statements however many people there are.
   */
  listTerminatingAccess(employeeIds: readonly string[], tx?: DbTx): Promise<TerminatingAccess[]> {
    return this.revocationView.terminatingAccess(employeeIds, tx);
  }

  /**
   * Whether the IT Admin may work for a person who is themselves (`QĐ-77m`): not while another usable IT Admin can, and then
   * the act is marked as self-executed. The review of a service account and its grant both ask it; with `tx` the other IT Admins
   * are counted in the transaction of the act. Throws ProvisioningAnotherItAdminNeededError.
   */
  selfExecutionMode(
    actor: AuthenticatedPrincipal,
    beneficiaryEmployeeId: string,
    tx?: DbTx,
  ): Promise<SelfExecutionMode> {
    return this.frame.selfExecutionMode(actor, beneficiaryEmployeeId, tx);
  }

  /**
   * Locks the grant task of a request before the request itself is locked, so the order of locks is the one of the IT Admin
   * who works the task. Nothing happens for a request that has none.
   */
  lockGrantOfRequest(tx: DbTx, requestId: string, employeeId?: string): Promise<void> {
    return this.cancellations.lockGrantOf(tx, requestId, employeeId);
  }

  /**
   * The seat the grant of a request made, when that grant is done: where a person whose request cannot be withdrawn goes on, with
   * the return of that seat (`US-05-13`). Null when the request has no grant or its grant is not done.
   */
  completedGrantOfRequest(tx: DbTx, requestId: string, employeeId?: string): Promise<string | null> {
    return this.cancellations.completedGrantOf(tx, requestId, employeeId);
  }

  /**
   * What the withdrawal of a request does to its grant (`US-05-08`): a task nobody has worked is cancelled with its assignment,
   * and every other case is answered for the caller to act on. Done in the caller transaction. Throws AssignmentNotFoundError
   * and AssignmentNotOpenError.
   */
  cancelGrantOfRequest(tx: DbTx, actor: AuthenticatedPrincipal, input: GrantCancelInput): Promise<GrantCancellation> {
    return this.cancellations.cancelForWithdrawal(tx, actor, input);
  }

  /**
   * The entry of the connector when a try failed (US-07-04): a temporary failure waits for its next try, anything else
   * goes to the failure queue for an IT Admin to decide. Throws ProvisioningTaskNotFoundError,
   * ProvisioningTaskNotConnectorError and ProvisioningTaskStateError.
   */
  recordProvisioningFailure(input: {
    taskId: string;
    kind: ProvisioningFailureKind;
    detail: string;
    now?: Date;
  }): Promise<FailureRecorded> {
    return this.provisioningFailures.recordFailure(input);
  }

  /**
   * One page of the personal seats a person holds today in these plans, and how many in all: what a head sees of the
   * tools a person already has that do the same work as the one asked for (`US-05-04` AC-3).
   */
  async getSeatsHeldInPlans(
    employeeId: string,
    planIds: readonly string[],
    page: { skip: number; take: number },
  ): Promise<{ items: AssignmentRecord[]; total: number }> {
    return this.assignments.pageHeldOfPlans(employeeId, planIds, page);
  }
}
