import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../core/business-date';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import type { SeatTarget, SeatTargetRef } from '../catalog/catalog.types';
import { OrganizationService } from '../organization/organization.service';
import { AssignmentRenewalService } from './assignment/assignment-renewal.service';
import { AssignmentService } from './assignment/assignment.service';
import { RegisteredRenewalHold } from './assignment/registered-renewal-hold.service';
import { RegisteredResponsibleDeadline } from './assignment/registered-responsible-deadline.service';
import { ServiceAccountDutyService } from './assignment/service-account-duty.service';
import { ProvisioningFailureService, type FailureRecorded } from './provisioning/provisioning-failure.service';
import { OpenGrantTaskService } from './provisioning/open-grant-task.service';
import {
  ProvisioningCancellationService,
  type GrantCancelInput,
} from './provisioning/provisioning-cancellation.service';
import { ProvisioningTaskFrame } from './provisioning/provisioning-task-frame.service';
import { RegisteredGrantRequestGate } from './provisioning/registered-grant-request-gate.service';
import { RegisteredRevocationHook } from './provisioning/registered-revocation-hook.service';
import { RevocationReadService } from './provisioning/revocation-read.service';
import { RevocationService } from './provisioning/revocation.service';
import type {
  AssignmentRecord,
  BaselineFacts,
  BaselineProgress,
  GrantCancellation,
  GrantRequestGate,
  NewBaselineAssignment,
  OpenedRevocation,
  OpenRevocationInput,
  PersonalSeat,
  ProvisioningFailureKind,
  RevocationHook,
  RevocationSource,
  SeatHolder,
  SelfExecutionMode,
  TerminatingAccess,
} from './licensing.types';
import type { AssignmentFacts, RenewalHold, RenewAssignmentInput, RenewedAssignment } from './licensing-renewal.types';
import { HandoverService } from './handover/handover.service';
import type {
  CancelHandoverInput,
  HandoverDutyBrief,
  OpenedHandoverDuties,
  OpenHandoverDutiesInput,
  ReconcileHandoverInput,
} from './licensing-handover.types';
import type { OpenGrantTask } from './licensing-open-grants.types';
import type { SeatBaselineClosedListener } from './licensing-seat-baseline.types';
import type { ResponsibleDeadlineProvider, ServiceAccountDuty } from './licensing-service-account.types';
import { SeatBaselineService } from './seat-baseline/seat-baseline.service';

/**
 * The licensing facade other modules call (`data-import` for the seat baseline). It answers what a baseline import must
 * know to judge a file, and writes the rows the import confirmed; the rules of the seats themselves live behind it.
 */
@Injectable()
export class LicensingService {
  constructor(
    private readonly assignments: AssignmentService,
    private readonly baseline: SeatBaselineService,
    private readonly provisioningFailures: ProvisioningFailureService,
    private readonly organization: OrganizationService,
    private readonly gate: RegisteredGrantRequestGate,
    private readonly cancellations: ProvisioningCancellationService,
    private readonly frame: ProvisioningTaskFrame,
    private readonly revocations: RevocationService,
    private readonly revocationReads: RevocationReadService,
    private readonly revocationHook: RegisteredRevocationHook,
    private readonly renewals: AssignmentRenewalService,
    private readonly renewalHold: RegisteredRenewalHold,
    private readonly handovers: HandoverService,
    private readonly responsibleDeadlines: RegisteredResponsibleDeadline,
    private readonly serviceAccountDuties: ServiceAccountDutyService,
    private readonly openGrants: OpenGrantTaskService,
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
   * The modules that extend a revocation (the handover confirmation, the return of a seat) tell licensing how when they start: a
   * step opened with the task, a refusal to start or end the work while it is not done, and what became of the task. Each
   * names its own slot, so one does not replace another; licensing never imports them.
   */
  registerRevocationHook(hook: RevocationHook, name?: string): void {
    this.revocationHook.register(hook, name);
  }

  /**
   * Opens the handover confirmation of every personal seat of a person who leaves, as soon as the departure is recorded and before
   * any revocation task exists: the head of their department (a successor to a head who leaves) confirms each tool, and the tool
   * is held until it is confirmed or the deadline `dueOn`, which the caller counts in working days (the last working day less one
   * for a planned departure). A seat that has a duty waiting or a confirmation that answers it gets none. Creates and completes no
   * task. The other sources open theirs through the revocation they open.
   */
  openHandoverDuties(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: OpenHandoverDutiesInput,
  ): Promise<OpenedHandoverDuties> {
    return this.handovers.open(tx, actor, input);
  }

  /** The deadline of the case that opened duties moved: the duties still waiting take it and the reminder starts over. */
  reconcileHandoverDuties(tx: DbTx, actor: AuthenticatedPrincipal, input: ReconcileHandoverInput): Promise<number> {
    return this.handovers.reconcile(tx, actor, input);
  }

  /** The case that opened duties was cancelled: the duties still waiting are cancelled with the reason; confirmed ones stay. */
  cancelHandoverDuties(tx: DbTx, actor: AuthenticatedPrincipal, input: CancelHandoverInput): Promise<number> {
    return this.handovers.cancelByCase(tx, actor, input);
  }

  /**
   * The open service accounts these people answer for (`US-03-08`): what a transfer or a departure leaves to be handed on, and what
   * keeps the record of either from being closed. A fixed number of statements however many people there are.
   */
  listServiceAccountDuties(employeeIds: readonly string[], tx?: DbTx): Promise<ServiceAccountDuty[]> {
    return this.serviceAccountDuties.openOf(employeeIds, tx);
  }

  /**
   * The module of personnel tells licensing which people have a transfer or a departure that is not closed, and the day it takes
   * effect, when it starts; licensing never imports it. A change of the person responsible for a service account may not come
   * later than that day while it has not come, and the list of duties and its reminder read the same people.
   */
  registerResponsibleDeadlineProvider(provider: ResponsibleDeadlineProvider): void {
    this.responsibleDeadlines.register(provider);
  }

  /**
   * A seat as the return and the renewal of it judge it: its dates, whether it is open, the chain of records before it, what the
   * grant it was made for is, and whether a revocation of it is under way. With `lock` it is read under the lock of the
   * subscription and then of the assignment, which is how a renewal is asked for. Throws AssignmentNotFoundError.
   */
  getAssignmentFacts(tx: DbTx, assignmentId: string, options: { lock?: boolean } = {}): Promise<AssignmentFacts> {
    return this.renewals.read(tx, assignmentId, options.lock ?? false);
  }

  /**
   * Renews a seat that has an end date (`US-05-14`): the old record ends where the right was expected to end, or today when the
   * decision comes later, and a new record of the same seat begins that day, chained to it; the old one keeps the end it had. The
   * seats taken on any day do not change. Done in the transaction of the request that was approved. Throws
   * AssignmentNotFoundError, AssignmentRenewalRefusedError and AssignmentConflictError.
   */
  renewAssignment(tx: DbTx, actor: AuthenticatedPrincipal, input: RenewAssignmentInput): Promise<RenewedAssignment> {
    return this.renewals.renew(tx, actor, input);
  }

  /** The module of requests tells licensing which seats have a renewal waiting when it starts; licensing never imports it. */
  registerRenewalHold(hold: RenewalHold): void {
    this.renewalHold.register(hold);
  }

  /**
   * Whether a seat has a renewal waiting for its decision: the revocation of a right that has reached its end leaves it alone
   * while one does (`US-05-14` AC-4). False until the module of requests registers its hold.
   */
  hasPendingRenewal(assignmentId: string, tx?: DbTx): Promise<boolean> {
    return this.renewalHold.hasPendingRenewal(assignmentId, tx);
  }

  /**
   * The personal seats a person holds on `onDate` or will, with how each is taken away (its kind of provisioning, the note of
   * the plan and whether removal loses data) and the revocation under way: what the list of a departure and the review after a
   * transfer start from. A fixed number of statements however many seats there are.
   */
  listPersonalSeatsOf(employeeId: string, onDate: BusinessDate, tx?: DbTx): Promise<PersonalSeat[]> {
    return this.revocationReads.personalSeatsOf(employeeId, onDate, tx);
  }

  /** How many personal seats each of these people holds on `onDate` or will, in one statement (the people with none are absent). */
  countPersonalSeatsOf(employeeIds: readonly string[], onDate: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    return this.revocationReads.countPersonalSeats(employeeIds, onDate, tx);
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
    return this.revocationReads.openedByReference(reference.sources, reference.referenceId, assignmentIds, tx);
  }

  /**
   * Where the handover confirmation of each of these seats stands (the latest duty of each, a live one before a cancelled one): who it
   * falls to now, until when, and whether the work went on without it. A fixed number of statements however many seats there are.
   */
  getHandoverDutiesOf(assignmentIds: readonly string[], tx?: DbTx): Promise<HandoverDutyBrief[]> {
    return this.handovers.briefsOf(assignmentIds, tx);
  }

  /**
   * The K1 seats of these people whose renewal is cancelled but whose access runs on to the end of the paid period: the warning
   * that a person who left still has access until a day. A fixed number of statements however many people there are.
   */
  listTerminatingAccess(employeeIds: readonly string[], tx?: DbTx): Promise<TerminatingAccess[]> {
    return this.revocationReads.terminatingAccess(employeeIds, tx);
  }

  /**
   * Whether the IT Admin may work for a person who is themselves (`QĐ-77m`): not while another usable IT Admin can, and then
   * the act is marked as self-executed. The review of a service account and its grant both ask it; with `tx` the other IT Admins
   * are counted in the transaction of the act (F24). Throws ProvisioningAnotherItAdminNeededError.
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
   * The grant tasks of a person that are not finished (queued, waiting for a retry, being worked or failed), oldest first, with the
   * plan of each and the total (`US-03-04` AC-24). Nothing here changes a task. The cost of a page is the same whatever its size.
   */
  listOpenGrantTasksOfBeneficiary(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: OpenGrantTask[]; total: number }> {
    return this.openGrants.pageOf(employeeId, page, tx);
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

  /** The target a baseline is for: exactly one subscription or one internal plan. Throws SeatTargetInvalidError. */
  seatTargetRef(input: { subscriptionId?: string; planId?: string }): SeatTargetRef {
    return this.assignments.targetRef(input);
  }

  /**
   * The target of a baseline (one subscription or one internal plan) read without a lock, for a preview. Throws
   * SeatTargetNotFoundError, SeatPlanNotSupportedError, SeatTargetInvalidError and SeatQuantityUnknownError.
   */
  resolveBaselineTarget(ref: SeatTargetRef, tx?: DbTx): Promise<SeatTarget> {
    return this.assignments.resolveBaselineTarget(ref, tx);
  }

  /** The same, locked until the transaction ends: the subscription `FOR UPDATE`, an internal plan `FOR SHARE`. */
  lockBaselineTarget(tx: DbTx, ref: SeatTargetRef): Promise<SeatTarget> {
    return this.assignments.lockBaselineTarget(tx, ref);
  }

  /** The people who hold a seat today and how many, for the review of a people file that leaves them out (`US-02-02` AC-4). */
  openSeatHolders(): Promise<SeatHolder[]> {
    return this.assignments.openHolders();
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

  /** The module of requests tells licensing how to judge a request when it starts; licensing never imports it. */
  registerGrantRequestGate(gate: GrantRequestGate): void {
    this.gate.register(gate);
  }

  /**
   * The module of personnel tells licensing it wants to hear when the seat baseline is closed, with the people who hold a seat on
   * another department's subscription (F21); licensing never imports it. Called in the transaction of the closing.
   */
  registerSeatBaselineClosedListener(listener: SeatBaselineClosedListener): void {
    this.baseline.registerClosedListener(listener);
  }

  /** Whether the baseline is closed and how many assignments it has produced, for the onboarding checklist. */
  async getBaselineProgress(): Promise<BaselineProgress> {
    const state = await this.baseline.state();

    return { closed: state.closed, closedAt: state.closedAt, assignments: await this.assignments.countBaseline() };
  }

  /** Whether the baseline is closed, the day rows without a grant date are recorded from, and what is already kept. */
  async baselineFacts(target: SeatTarget, tx?: DbTx): Promise<BaselineFacts> {
    const [recordedOn, state, existing] = await Promise.all([
      this.organization.businessToday(new Date(), tx),
      this.baseline.state(tx),
      this.assignments.existingOf(target, tx),
    ]);

    return { target, recordedOn, closed: state.closed, existing };
  }

  /**
   * Writes the assignments of the rows a baseline import confirmed, each with its audit event, in the caller transaction.
   * Holds the baseline state `FOR SHARE` first, so a closing waits for it. Throws SeatBaselineClosedError and
   * AssignmentConflictError (the row the database refused, which means the data changed since the preview).
   */
  async createBaselineAssignments(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { importId: string; target: SeatTarget; rows: readonly NewBaselineAssignment[] },
  ): Promise<AssignmentRecord[]> {
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('A baseline was written before installation');
    await this.baseline.lockOpen(tx);

    return this.assignments.createBaseline(tx, actor, { organizationId: organization.id, ...input });
  }
}
