import type { BusinessDate } from '../../core/business-date';
import type { SeatTarget } from '../catalog/catalog.types';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';

export type AssignmentKind = 'PERSONAL' | 'SERVICE';
export type AssignmentSource = 'BASELINE' | 'HANDOVER' | 'REQUEST';
export type AssignmentDateBasis = 'ACTUAL' | 'RECORDED';

/** One seat held by one person on one subscription (or one internal plan) over `[effectiveFrom, validUntil)`. */
export interface AssignmentRecord {
  id: string;
  source: AssignmentSource;
  kind: AssignmentKind;
  planId: string;
  subscriptionId: string | null;
  employeeId: string;
  accountIdentifier: string;
  reason: string | null;
  costCenterId: string | null;
  /** The department that owns a service account (`QĐ-86c`); null for a personal seat. */
  owningDepartmentId: string | null;
  effectiveFrom: BusinessDate;
  effectiveFromBasis: AssignmentDateBasis;
  validUntil: BusinessDate | null;
  expectedEndDate: BusinessDate | null;
  predecessorId: string | null;
  /** Set when the grant it was made for was closed as failed: the period is then empty and no seat is taken. */
  failedAt: Date | null;
  /** Set when the grant it was made for was cancelled because the request was withdrawn: the period is empty as well. */
  cancelledAt: Date | null;
  createdAt: Date;
}

/** An assignment as it is answered: the start is never shown as a grant date when the real one is not known (`QĐ-43b`). */
export interface AssignmentView extends AssignmentRecord {
  grantedOn: BusinessDate | null;
  effectiveFromLabel: string | null;
}

/** An assignment of a list, with who holds it, which plan it is of and which Cost Center it is charged to (`LD-10`). */
export interface AssignmentSummaryView extends AssignmentView {
  employee: { employeeId: string; employeeCode: string; fullName: string };
  plan: { planId: string; planName: string; applicationName: string };
  costCenter: { id: string; code: string; name: string } | null;
}

/** Who holds the seat a request is granted and under which account, with what a service account says besides (`US-05-21`). */
export interface AssignmentHolder {
  employeeId: string;
  accountIdentifier: string;
  kind: AssignmentKind;
  reason: string | null;
  costCenterId: string | null;
  owningDepartmentId: string | null;
}

/** What the baseline import asks to be written for one valid row. */
export interface NewBaselineAssignment {
  kind: AssignmentKind;
  employeeId: string;
  accountIdentifier: string;
  reason: string | null;
  costCenterId: string | null;
  owningDepartmentId: string | null;
  effectiveFrom: BusinessDate;
  effectiveFromBasis: AssignmentDateBasis;
  expectedEndDate: BusinessDate | null;
}

/** What the import needs to know of an assignment already kept, to judge a row against it. */
export interface ExistingAssignment {
  employeeId: string;
  kind: AssignmentKind;
  normalizedAccountIdentifier: string;
  effectiveFrom: BusinessDate;
  validUntil: BusinessDate | null;
}

/** The facts the judgement of a baseline file stands on, read together. */
export interface BaselineFacts {
  target: SeatTarget;
  /** The day the rows without a grant date are recorded from: today in the organization's calendar. */
  recordedOn: BusinessDate;
  closed: boolean;
  existing: ExistingAssignment[];
}

/** How far the seat baseline is: whether it is closed and how many assignments it has produced. */
export interface BaselineProgress {
  closed: boolean;
  closedAt: Date | null;
  assignments: number;
}

/** A person who holds seats today, and how many. */
export interface SeatHolder {
  employeeId: string;
  seats: number;
}

export interface SeatUsage {
  subscriptionId: string;
  purchased: number | null;
  occupied: number;
  free: number | null;
  asOf: BusinessDate;
}

export interface AssignmentListFilter {
  subscriptionId?: string;
  planId?: string;
  employeeId?: string;
  source?: AssignmentSource;
  kind?: AssignmentKind;
  skip: number;
  take: number;
}

export type ProvisioningKind = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
export type ProvisioningTaskKind = 'GRANT' | 'REVOKE';
export type ProvisioningChannel = 'MANUAL' | 'CONNECTOR';
export type ProvisioningTaskStatus =
  'QUEUED' | 'RETRY_SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CLOSED_FAILED' | 'CANCELLED';

/** How a task failed (`F-12`): only a temporary failure is tried again by itself. */
export type ProvisioningFailureKind = 'TRANSIENT' | 'PERMANENT' | 'AUTHENTICATION' | 'QUOTA_EXCEEDED' | 'NOT_DONE';

/** What the IT Admin may decide about a failed task. */
export type ProvisioningDecision = 'RETRY' | 'HAND_OFF' | 'CLOSE_FAILED';

/** What a person does to a task of the manual channel. */
export type ProvisioningAction = 'CLAIM' | 'COMPLETE' | 'FAIL';

export type TaskStepCode =
  | 'BUY_ON_COMPANY_ACCOUNT'
  | 'ADD_TO_WORKSPACE'
  | 'GRANT_IN_INTERNAL_SOFTWARE'
  | 'OPEN_KEY_STORE'
  | 'ASSIGN_KEY_WITH_COMPANY_DEVICE'
  | 'CANCEL_RENEWAL_ON_PROVIDER'
  | 'RECORD_ACCESS_STATE'
  | 'REMOVE_FROM_WORKSPACE'
  | 'REVOKE_IN_INTERNAL_SOFTWARE'
  | 'CONFIRM_WITH_EVIDENCE';

/** One step of the card of a task. A K2 step is done under the name of whoever does the work: no shared credential. */
export interface TaskStep {
  code: TaskStepCode;
  accountIdentifier?: string;
  adminIdentity?: 'ACTING_IT_ADMIN';
}

export type TaskDoneWhen =
  | 'PURCHASE_CONFIRMED'
  | 'MEMBER_ACTIVE'
  | 'KEY_ASSIGNED_WITH_DEVICE'
  | 'CONFIRMED_WITH_EVIDENCE'
  | 'RENEWAL_CANCELLED_WITH_ACCESS_STATE'
  | 'ACCOUNT_REMOVED_OR_NOT_NEEDED'
  | 'REVOKED_OFF_SYSTEM_WITH_EVIDENCE';

/**
 * What the module that owns requests says when asked to grant one: it may be granted (for whom, and the plan asked for),
 * or it is not known, not approved enough yet, or already ended. The grant of a seat trusts this answer for the state of
 * the request; the seat itself it judges alone.
 */
export type GrantRequestAnswer =
  | { status: 'GRANTABLE'; seat: 'PERSONAL'; employeeId: string; planId: string; expectedEndDate: string | null }
  | {
      status: 'GRANTABLE';
      seat: 'SERVICE';
      /** The person who answers for the account, as the request names them. */
      employeeId: string;
      planId: string;
      expectedEndDate: string | null;
      serviceAccount: ServiceAccountGrant;
    }
  | {
      status:
        | 'NOT_FOUND'
        | 'NOT_APPROVED'
        | 'ENDED'
        | 'NOT_IN_CATALOG'
        | 'BOUNDARY_NOT_CHECKED'
        /** The request is for a group and the grant did not say for which person of it (`US-05-17` AC-6). */
        | 'BENEFICIARY_REQUIRED';
    };

/**
 * What the request of a service account says to the grant (`US-05-21`): why the account exists, the identifier its sender
 * expects (only a hint for the IT Admin, who enters the real one), and the department that owns it with the Unit Cost Center
 * the request was charged to.
 */
export interface ServiceAccountGrant {
  purpose: string;
  expectedIdentifier: string;
  departmentId: string;
  costCenterId: string;
}

/** Whether an IT Admin may work for a beneficiary who is themselves, and whether the act is then marked as self-executed. */
export type SelfExecutionMode = 'ALLOW' | 'ALLOW_SELF_EXECUTED';

/**
 * What became of the grant of a request that its requester withdrew (`US-05-08`): there was none, it was cancelled with its
 * assignment, it is being worked (so the withdrawal waits), it is done (so the way back is a return), it failed and waits for
 * the IT Admin to close it as cancelled, or it had ended already.
 */
export type GrantCancellation =
  | { status: 'NO_TASK' | 'RUNNING' | 'ENDED' }
  /** The grant is done: the seat is real, and `assignmentId` is the one a return then names (`US-05-13`). */
  | { status: 'COMPLETED'; assignmentId: string }
  /** `taskStatus` is the state the task was in when it was cancelled. */
  | { status: 'CANCELLED'; taskId: string; taskStatus: ProvisioningTaskStatus }
  | { status: 'FAILED'; taskId: string }
  /** The task is being worked and the person it was for left: the IT Admin must say, with evidence, that the work is undone. */
  | { status: 'EVIDENCE_REQUIRED' };

/** The reason kept on a task that was cancelled because its request was withdrawn. */
export const WITHDRAWAL_CANCEL_REASON = 'REQUESTER_WITHDREW';

/** How the work a request led to ended: the seat is real, or the IT Admin closed the grant as failed (`FR-2.5`, `QĐ-62i`). */
export type GrantOutcome = 'COMPLETED' | 'FAILED';

/**
 * The port the module of requests implements. The module registers its gate with `LicensingService.registerGrantRequestGate`
 * when it starts, so licensing never imports it; until then the gate refuses every request.
 */
export interface GrantRequestGate {
  /**
   * The state of the request as a read without a lock: to find the plan and the person before the grant begins. A request for a
   * group is granted one person at a time, so every call about its grant names the person (`employeeId`); a request for one
   * person ignores it.
   */
  check(requestId: string, employeeId?: string): Promise<GrantRequestAnswer>;
  /**
   * Inside the transaction of the grant: locks the request, judges it again and, only if it may be granted, moves it to
   * the state of a request being carried out. The move is what lets a request be granted once: a second grant finds it
   * no longer grantable. Any answer but `GRANTABLE` leaves the request as it was.
   */
  claimForGrant(tx: DbTx, requestId: string, employeeId?: string): Promise<GrantRequestAnswer>;
  /** Inside the transaction that completes or closes as failed the task of a grant: says how the request ended. */
  reportOutcome(tx: DbTx, requestId: string, outcome: GrantOutcome, employeeId?: string): Promise<void>;
  /** Whether the request waits for the IT Admin to close the task of its grant as cancelled: nothing else is decided on it. */
  isWithdrawing(tx: DbTx, requestId: string, employeeId?: string): Promise<boolean>;
  /**
   * Inside the transaction in which the IT Admin cancels the failed task of a withdrawn request: the request ends as withdrawn
   * and what was held for it goes back. Returns false, changing nothing, when the request was not waiting for that.
   */
  reportCancelled(tx: DbTx, requestId: string, employeeId?: string): Promise<boolean>;
}

export const GRANT_REQUEST_GATE = Symbol('GRANT_REQUEST_GATE');

/** The sources that can ask for the revocation of a seat (`US-07-05` AC-11); each one is a module that owns its own decision. */
export const REVOCATION_SOURCES = [
  'RETURN',
  'MANAGER_NOT_NEEDED',
  'TRANSFER_REVIEW',
  'GHOST_SEAT',
  'DEPARTURE',
  'ABRUPT_DEPARTURE',
  'TIME_LIMITED_EXPIRY',
  'SUBSCRIPTION_REDUCTION',
  'SUBSCRIPTION_CANCELLATION',
  'SUBSCRIPTION_EXPIRED',
  'NOT_LEGALIZED',
  'RE_EXECUTION',
] as const;
/**
 * What a row can say of where a revocation came from. `POST_SETUP_REVIEW` is written by the release after this one (spec L.10): this
 * release reads it and never accepts it as an input, so `REVOCATION_SOURCES` above (the inputs) does not have it.
 */
export const READABLE_REVOCATION_SOURCES = [...REVOCATION_SOURCES, 'POST_SETUP_REVIEW'] as const;
export type RevocationSource = (typeof READABLE_REVOCATION_SOURCES)[number];

/** How a revocation was completed: the account removed (K2), already gone, the renewal cancelled (K1), revoked off the system (K5). */
export type RevocationCompletion = 'ACCOUNT_REMOVED' | 'ALREADY_GONE' | 'RENEWAL_CANCELLED' | 'OFF_SYSTEM_REVOKED';

/** What is known of the access of a K1 seat once its renewal is cancelled: cut already, or running to the end of the paid period. */
export type AccessState = 'CUT' | 'UNTIL_PAID_END';

/** Who decided that a seat is revoked, and on what: the source module's own record of it, never a secret. */
export interface RevocationDecision {
  decidedByEmployeeId?: string | null;
  decidedRole: string;
  referenceKind?: string | null;
  referenceId?: string | null;
  note?: string | null;
}

/** What a source module hands to `LicensingService.openRevocation` (called in its own transaction). */
export interface OpenRevocationInput {
  assignmentId: string;
  /** Checked against `REVOCATION_SOURCES`: a missing or unknown source is refused. */
  source: string | undefined;
  decision: RevocationDecision;
  /** Handed to the hook as it is and kept nowhere here: the department, the short deadline, the notice of the handover step. */
  context?: RevocationContext;
  now?: Date;
}

export interface RevocationContext {
  departmentId?: string;
  dueOn?: BusinessDate;
  noticeText?: string;
}

/** What the opening of a revocation did: a task was made, or the seat had one already and the reason was added to it. */
export interface OpenedRevocation {
  taskId: string;
  created: boolean;
  reasonAdded: boolean;
  status: ProvisioningTaskStatus;
}

/** The facts of a revocation task the hook is told. */
export interface RevocationTaskFacts {
  id: string;
  assignmentId: string;
  employeeId: string;
  planId: string;
  status: ProvisioningTaskStatus;
}

/** A reason that asked for the revocation, as the hook is told it. */
export interface RevocationReasonFacts {
  source: RevocationSource;
  decidedByEmployeeId: string | null;
  decidedRole: string;
  referenceKind: string | null;
  referenceId: string | null;
}

/**
 * The port the modules that extend a revocation register (`g6-handover-confirmation`, and the return of a seat of
 * `g5-return-and-renewal-requests`): they open their step when a revocation is opened, may refuse to let the work start or end by
 * throwing from `beforeWork`, learn how the work ended, and are told when the task is closed as failed. The status of the task
 * the hook is told says which moment it is: before the task is taken it is `QUEUED` or `RETRY_SCHEDULED`, before it is completed
 * `IN_PROGRESS`. Without a hook none of the points runs.
 */
export interface RevocationHook {
  /**
   * After a task was opened or a reason added to it, in the caller transaction; `reasons` are all the task has, the first first.
   * `actor` is who asked for the revocation and `now` the instant the source gave (or the clock): the day a deadline counts from.
   */
  onOpened(
    tx: DbTx,
    task: RevocationTaskFacts,
    reasons: readonly RevocationReasonFacts[],
    context: RevocationContext,
    actor: AuthenticatedPrincipal,
    now: Date,
  ): Promise<void>;
  /** Before the task is taken and before it is completed, in the transaction of that action: throw to refuse. */
  beforeWork(tx: DbTx, task: RevocationTaskFacts, now: Date): Promise<void>;
  /** After the task was taken (`IN_PROGRESS`) or completed (`COMPLETED`), in the same transaction, by `actor`. */
  afterWork(tx: DbTx, task: RevocationTaskFacts, now: Date, actor: AuthenticatedPrincipal): Promise<void>;
  /**
   * After the IT Admin closed the failed task for good, in the same transaction: the seat stays as it was. A hook that has
   * nothing to do when a revocation fails leaves it out.
   */
  afterClosedFailed?(
    tx: DbTx,
    task: RevocationTaskFacts,
    closeReason: string,
    now: Date,
    actor: AuthenticatedPrincipal,
  ): Promise<void>;
}

/** A personal seat a person still holds with the plan that tells how it is taken away, and the revocation that is under way. */
export interface PersonalSeat {
  assignmentId: string;
  employeeId: string;
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  provisioningType: ProvisioningKind;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  subscriptionId: string | null;
  /** Why the seat was given, as the Assignment kept it (`US-03-07`: the head who reviews it reads it). */
  grantReason: string | null;
  effectiveFrom: BusinessDate;
  validUntil: BusinessDate | null;
  revocation: { taskId: string; status: ProvisioningTaskStatus; source: RevocationSource } | null;
}

/** A K1 seat whose renewal is cancelled and whose access runs on to the end of the paid period (`US-07-05` AC-19). */
export interface TerminatingAccess {
  assignmentId: string;
  employeeId: string;
  planId: string;
  subscriptionId: string | null;
  taskId: string;
  accessUntil: BusinessDate;
}
