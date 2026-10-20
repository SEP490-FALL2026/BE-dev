import type { BusinessDate } from '../../core/business-date';
import type { SeatTarget } from '../catalog/catalog.types';

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
  effectiveFrom: BusinessDate;
  effectiveFromBasis: AssignmentDateBasis;
  validUntil: BusinessDate | null;
  expectedEndDate: BusinessDate | null;
  predecessorId: string | null;
  /** Set when the grant it was made for was closed as failed: the period is then empty and no seat is taken. */
  failedAt: Date | null;
  createdAt: Date;
}

/** An assignment as it is answered: the start is never shown as a grant date when the real one is not known (`QĐ-43b`). */
export interface AssignmentView extends AssignmentRecord {
  grantedOn: BusinessDate | null;
  effectiveFromLabel: string | null;
}

/** What the baseline import asks to be written for one valid row. */
export interface NewBaselineAssignment {
  kind: AssignmentKind;
  employeeId: string;
  accountIdentifier: string;
  reason: string | null;
  costCenterId: string | null;
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
  'QUEUED' | 'RETRY_SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CLOSED_FAILED';

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
  | 'CONFIRM_WITH_EVIDENCE';

/** One step of the card of a task. A K2 step is done under the name of whoever does the work: no shared credential. */
export interface TaskStep {
  code: TaskStepCode;
  accountIdentifier?: string;
  adminIdentity?: 'ACTING_IT_ADMIN';
}

export type TaskDoneWhen =
  'PURCHASE_CONFIRMED' | 'MEMBER_ACTIVE' | 'KEY_ASSIGNED_WITH_DEVICE' | 'CONFIRMED_WITH_EVIDENCE';

/**
 * What the module that owns requests says when asked to grant one: it may be granted (for whom, and the plan asked for),
 * or it is not known, not approved enough yet, or already ended. The grant of a seat trusts this answer for the state of
 * the request; the seat itself it judges alone.
 */
export type GrantRequestAnswer =
  { status: 'GRANTABLE'; employeeId: string; planId: string } | { status: 'NOT_FOUND' | 'NOT_APPROVED' | 'ENDED' };

/** The port the module of requests implements (`provide: GRANT_REQUEST_GATE`); licensing ships one that refuses all. */
export interface GrantRequestGate {
  check(requestId: string): Promise<GrantRequestAnswer>;
}

export const GRANT_REQUEST_GATE = Symbol('GRANT_REQUEST_GATE');
