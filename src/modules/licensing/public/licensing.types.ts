import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditValue } from '../../audit/public/audit.types';
import type { SeatTarget } from '../../catalog/public/catalog.types';

export type AssignmentKind = 'PERSONAL' | 'SERVICE';
/** Where a seat came from; `RENEWAL_CARRY` is a seat carried to the period that renews its subscription (`QĐ-35c`). */
export type AssignmentSource = 'BASELINE' | 'HANDOVER' | 'REQUEST' | 'RENEWAL_CARRY' | 'MACHINE_ACCOUNT_CONVERSION';
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
  /** A personal seat of an IT Admin used for a machine account (`QĐ-110m`, `R-9`): INV-02 leaves it out; `machineAccountNote` says why. */
  isMachineAccount: boolean;
  machineAccountNote: string | null;
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

/** An assignment of a list, with who holds it, which plan it is of and which Cost Center it is charged to. */
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
  /** A flagged seat (`R-9`) does not count for INV-02: the person may take their own personal seat beside it. */
  isMachineAccount: boolean;
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

/** How many seats of one subscription one person holds (or answers for, a service account): what the baseline charges to their department (`QĐ-103k`). */
export interface SeatHolding {
  subscriptionId: string;
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
export type ProvisioningTaskKind = 'GRANT' | 'REVOKE' | 'EXTEND';
export type ProvisioningChannel = 'MANUAL' | 'CONNECTOR';
export type ProvisioningTaskStatus =
  'QUEUED' | 'RETRY_SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CLOSED_FAILED' | 'CANCELLED';

/** How a task failed: only a temporary failure is tried again by itself. */
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
  | 'DEACTIVATE_KEY_ON_DEVICE'
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
 * What the module that owns requests says when asked to grant one: it may be granted (for whom, which plan), or it is
 * not known, not approved enough yet, or already ended. The grant trusts this answer for the request; the seat it judges alone.
 */
export type GrantRequestAnswer =
  | {
      status: 'GRANTABLE';
      seat: 'PERSONAL';
      employeeId: string;
      planId: string;
      /** The department of the request: its seat is granted only on a subscription this department owns (`QĐ-89a`). */
      departmentId: string;
      expectedEndDate: string | null;
      /** The months the request asked for: the end of the seat when the request names no day (`QĐ-98`). */
      termMonths: number;
      /**
       * Whether the term of the request binds the seat: a request that costs money ends its seat with its term, a free internal one has no
       * end by term (`qd96-100-approved-end-date`, `Q-03` a1).
       */
      termBound: boolean;
    }
  | {
      status: 'GRANTABLE';
      seat: 'SERVICE';
      /** The person who answers for the account, as the request names them. */
      employeeId: string;
      planId: string;
      expectedEndDate: string | null;
      termMonths: number;
      /** A service account has no end by term. */
      termBound: false;
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
 * expects (a hint: the IT Admin enters the real one), and the department and Unit Cost Center that own it.
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
 * What became of the grant of a request its requester withdrew (`US-05-08`): none, cancelled with its assignment, being worked
 * (the withdrawal waits), done (the way back is a return), failed (the IT Admin closes it as cancelled) or already ended.
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
/** The cause a source gives for taking its reason for a revocation back, and the close reason of the task left with none (`US-07-05` AC-22). */
export const NO_LONGER_APPLIES = 'NO_LONGER_APPLIES';

/** How the work a request led to ended: the seat is real, or the IT Admin closed the grant as failed (`FR-2.5`, `QĐ-62i`). */
export type GrantOutcome = 'COMPLETED' | 'FAILED';

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
  // The head of the holder's department decided, after the installation, that a seat on another department's subscription goes.
  'POST_SETUP_REVIEW',
  // The holder moved to another department and the grace of five working days ran out (QĐ-110p).
  'TRANSFER',
] as const;
export type RevocationSource = (typeof REVOCATION_SOURCES)[number];

/** How a revocation was completed: the account removed (K2), already gone, the renewal cancelled (K1), revoked off the system (K5). */
export type RevocationCompletion =
  'ACCOUNT_REMOVED' | 'ALREADY_GONE' | 'RENEWAL_CANCELLED' | 'OFF_SYSTEM_REVOKED' | 'KEY_DEACTIVATED';

/** Where the key of a K4 seat goes when its revocation is completed: back to the store, or back and withdrawn from it at once. */
export type KeyDisposition = 'RETURN_TO_STORE' | 'WITHDRAW';

/** What is known of the access of a K1 seat once its renewal is cancelled: cut already, or running to the end of the paid period. */
export type AccessState = 'CUT' | 'UNTIL_PAID_END';

/**
 * Which list of steps the IT Admin ticks to complete the revocation of a K1 seat (`QĐ-111az`, `US-07-05` AC-19): the server decides it from why the
 * seat is revoked. `DEPARTURE` is for a person who leaves (the mailbox is reset and locked); `STILL_EMPLOYED` is for any other source, where the
 * person still works and only the renewal is turned off.
 */
export const K1_CHECKLIST_VARIANTS = ['DEPARTURE', 'STILL_EMPLOYED'] as const;
export type K1ChecklistVariant = (typeof K1_CHECKLIST_VARIANTS)[number];

/** Every step a K1 revocation checklist can hold; which of them a task has depends on its variant. */
export const K1_CHECKLIST_CODES = [
  'MAILBOX_PASSWORD_RESET',
  'SOFTWARE_FORGOT_PASSWORD',
  'SESSIONS_SIGNED_OUT',
  'RENEWAL_DISABLED',
  'EVIDENCE_RECORDED',
  'MAILBOX_LOCKED',
] as const;
export type K1ChecklistCode = (typeof K1_CHECKLIST_CODES)[number];

/**
 * What the server expects of the checklist of one K1 revocation, told to a client whose checklist was refused: the variant it worked out and
 * the steps this task has, in order (`MAILBOX_LOCKED` is among them only for the last K1 revocation of the person).
 */
export interface K1ChecklistExpectation {
  variant: K1ChecklistVariant;
  codes: K1ChecklistCode[];
}

/** What a completed K1 revocation tells its listeners of the checklist: the variant and the steps that were ticked (`MAILBOX_LOCKED` among them). */
export interface K1ChecklistFacts {
  variant: K1ChecklistVariant;
  doneCodes: K1ChecklistCode[];
}

/** Who decided that a seat is revoked, and on what: the source module's own record of it, never a secret. */
export interface RevocationDecision {
  decidedByEmployeeId?: string | null;
  decidedRole: string;
  referenceKind?: string | null;
  referenceId?: string | null;
  note?: string | null;
}

/** What a source module hands to `LicensingApi.openRevocation` (called in its own transaction). */
export interface OpenRevocationInput {
  assignmentId: string;
  /** Checked against `REVOCATION_SOURCES`: a missing or unknown source is refused. */
  source: string | undefined;
  decision: RevocationDecision;
  /** Handed to the listeners as it is and kept nowhere here: the department, and a deadline and a notice that no listener reads since `QĐ-110g` (the handover is gone; the type goes in a later clean-up). */
  context?: RevocationContext;
  /**
   * The timing the source asks for (BR-MF5-04): `notBefore` is the first day the IT Admin may take or complete the work, `dueOn` the day it
   * is due. Nothing given is no timing: the work is taken at once, as it was before. Only MF-5 gives `notBefore` (the grace of a ghost
   * seat); a reason with none wins over one that has it when both ask for the same seat.
   */
  timing?: { dueOn?: BusinessDate; notBefore?: BusinessDate };
  /** `{ holder: true }`: the person who holds the seat is told once that its revocation is coming. Nothing given: nobody is told. */
  notice?: { holder: true };
  now?: Date;
}

/**
 * Who the Audit Trail names for an event when the caller is the controlled procedure `ops:record-super-admin-event` or the conversion
 * command: an operator working a ticket, never an account. The `actor` a facade is given then only fills the columns that still
 * demand an account; the events say `OPERATOR`, no account, the ticket as the reference and as the correlation. `context` is what
 * the command adds to the `after` of every event it writes (references only).
 */
export interface OperatorAuditActor {
  ticketId: string;
  ticketRef: string;
  context?: { readonly [key: string]: AuditValue };
}

/**
 * The system acting on a rule nobody decides in the moment (the revocation when the grace of a transfer ends, `QĐ-110p`): no account, so
 * the task it makes is marked as made by the system (T-10) and its audit event says `SYSTEM`. `correlationId` ties the event to the pass
 * that made it (the key of the sweep and the day).
 */
export interface SystemActor {
  readonly kind: 'SYSTEM';
  readonly correlationId: string;
}

/** Whether `actor` is the system rather than an account. An account carries no `kind`. */
export function isSystemActor(actor: AuthenticatedPrincipal | SystemActor): actor is SystemActor {
  return 'kind' in actor && actor.kind === 'SYSTEM';
}

export interface RevocationContext {
  departmentId?: string;
  dueOn?: BusinessDate;
  noticeText?: string;
}

/** The reason a source takes back (`withdrawRevocationReason`): which seat, which of its own reasons, and why it no longer holds. */
export interface WithdrawRevocationInput {
  assignmentId: string;
  source: RevocationSource;
  referenceId: string | null;
  cause: 'NO_LONGER_APPLIES';
  /** The account that works the task now: a task in progress with no reason left is cancelled only when this account took it. */
  cancelInProgressClaimedBy?: string;
  /** The controlled procedure acting under a ticket: the Audit Trail then says `OPERATOR` and the `actor` only fills the columns that need an account. */
  operator?: OperatorAuditActor;
}

/**
 * What the withdrawal did to the task of the seat: `CONTINUES` (other reasons stand), `CANCELLED` (none left: no longer applies),
 * `IT_ADMIN_TO_CLOSE` (none left but another IT Admin is working it), `ALREADY_ENDED` (done, closed or cancelled), `NOT_FOUND`
 * (no standing reason of that source and reference).
 */
export interface WithdrawnRevocation {
  taskId: string | null;
  outcome: 'CONTINUES' | 'CANCELLED' | 'IT_ADMIN_TO_CLOSE' | 'ALREADY_ENDED' | 'NOT_FOUND';
}

/** What the opening of a revocation did: a task was made, or the seat had one already and the reason was added to it. */
export interface OpenedRevocation {
  taskId: string;
  created: boolean;
  reasonAdded: boolean;
  status: ProvisioningTaskStatus;
}

/**
 * What a listener needs to tell the money the right still holds, known only when the revocation has been completed (`AFTER_WORK` with the status
 * `COMPLETED`): the request that made the right, the day it ends and what is paid for it.
 */
export interface RevocationCompletedFacts {
  /** The request whose grant made the right, found through the chain of assignments (a renewal, a handover); null when no request made it. */
  grantRequestId: string | null;
  /**
   * The assignment taken back and every one it continues (`predecessor_id`), the one taken back first: what a request to go on using names, so
   * the money held for the right by such a request is found too (G4-01, G9-02).
   */
  chainAssignmentIds: string[];
  provisioningType: ProvisioningKind;
  /** The day the right ends: it holds the seat on every day before it (`valid_until`). */
  endedOn: BusinessDate | null;
  /** K1 only: the last day the provider was paid for; the access may run to it. */
  paidThroughOn: BusinessDate | null;
  /** Every source that asked for the revocation. */
  sources: RevocationSource[];
  /** K1 only: the checklist the IT Admin ticked, so a listener can read `MAILBOX_LOCKED` (`QĐ-111az`); null for any other kind of provisioning. */
  k1Checklist: K1ChecklistFacts | null;
}

/**
 * What the request is told of the grant that completed for it, beyond the outcome (`BR-MF1-09c`, `M-10`): whether the seat was taken from the
 * stock of the pool of its plan with nothing bought, the kind of right, the day the grant was completed (the day the right begins to be
 * used) and the assignment it made.
 */
export interface GrantOutcomeFacts {
  fromPool: boolean;
  provisioningType: ProvisioningKind;
  grantedOn: BusinessDate;
  assignmentId: string;
}

/**
 * Where the money held for a right is found: the request whose grant made it (a renewal or a handover carries the right on, so it is found
 * through the chain) and the assignments the right continues, the one given first. The same two facts a completed revocation tells its listeners.
 */
export interface RightChain {
  assignmentId: string;
  grantRequestId: string | null;
  chainAssignmentIds: string[];
}

/** The facts of a revocation task its listeners are told. */
export interface RevocationTaskFacts {
  id: string;
  assignmentId: string;
  employeeId: string;
  planId: string;
  status: ProvisioningTaskStatus;
  /** Set only when the revocation has been completed. */
  completed?: RevocationCompletedFacts;
}

/** A reason that asked for the revocation, as its listeners are told it. */
export interface RevocationReasonFacts {
  source: RevocationSource;
  decidedByEmployeeId: string | null;
  decidedRole: string;
  referenceKind: string | null;
  referenceId: string | null;
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

/** A seat a person holds today, as a department head reads it: the software and the plan by name and the days the seat begins and ends. */
export interface HeldSoftware {
  assignmentId: string;
  applicationName: string;
  planName: string;
  grantedOn: BusinessDate;
  endsOn: BusinessDate | null;
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

/** What the shared pool of a plan holds today, as the queue of the IT Admin shows it: seats (K2), keys (K4) or nothing counted (the other kinds). */
export interface PlanStock {
  kind: 'SEATS' | 'KEYS' | 'NONE';
  /** Seats or keys bought and not held by a right in force today, counted over the subscriptions a grant can take them from. */
  free: number;
  /** Seats or keys held by a right whose revocation is still open: not free yet. */
  inRevocation: number;
}

/** One seat the baseline wrote on a subscription another department owns, with the department that owns it. */
export interface SeatBaselineClosedSeat {
  assignmentId: string;
  /** The department that owns the subscription the seat sits on. */
  owningDepartmentId: string;
}

/** A person who holds seats on subscriptions of other departments than their own on the day step 4 is closed, with those seats. */
export interface SeatBaselineClosedHolder {
  employeeId: string;
  /** The department the person is in on the closing day (the head of this department decides the review, `QĐ-89e`). */
  employeeDepartmentId: string;
  /** Sorted by assignment id. */
  assignments: SeatBaselineClosedSeat[];
}
