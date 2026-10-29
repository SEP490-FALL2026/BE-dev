import type { BusinessDate } from '../../../core/business-date';
import type { Grounds, GroundsInput } from '../policies/grounds.policy';
import type { RoleFlag } from '../public/personnel.types';

export type OffboardingState = 'HANDING_OVER' | 'LEFT' | 'CANCELLED';
export type OffboardingChangeKind =
  | 'RECORDED'
  | 'LAST_DAY_CHANGED'
  | 'CANCELLED'
  | 'MARKED_LEFT'
  | 'ACCOUNT_LOCK_RECORDED'
  | 'REVOCATIONS_OPENED'
  | 'CLOSED';

/** What the person was doing before the handover began. */
export type PriorWorkState = 'WORKING' | 'ON_LONG_LEAVE';

/** Who follows a head who leaves: a member of the department that day, or nobody (`QĐ-77k`, `QĐ-66a`). */
export type SuccessorChoice = { kind: 'EMPLOYEE'; employeeId: string } | { kind: 'NONE' };

/** What a handover of the head of the department moved, kept with the case so a move or a cancellation restores it exactly. */
export interface HeadHandoverFacts {
  endedPeriodId: string;
  endedPeriodValidTo: BusinessDate | null;
  createdPeriodId: string | null;
  successor: 'EMPLOYEE' | 'NONE';
  successorEmployeeId: string | null;
}

export interface OffboardingRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  departmentId: string;
  state: OffboardingState;
  abrupt: boolean;
  priorWorkState: PriorWorkState;
  lastWorkingDay: BusinessDate;
  departureEffectiveOn: BusinessDate;
  handoverDueOn: BusinessDate | null;
  grounds: Grounds;
  headHandover: HeadHandoverFacts | null;
  placementClosedId: string | null;
  leftOn: BusinessDate | null;
  leftAt: Date | null;
  leftByAppUserId: string | null;
  cancelledAt: Date | null;
  cancelledByAppUserId: string | null;
  cancelledByTicketId: string | null;
  cancelReason: string | null;
  accountLockByAppUserId: string | null;
  accountLockAt: Date | null;
  accountLockNote: string | null;
  closedAt: Date | null;
  closedByAppUserId: string | null;
  /** Who recorded it: an account, or the ticket of the controlled procedure (spec L.2): exactly one of the two is set. */
  recordedByAppUserId: string | null;
  recordedByTicketId: string | null;
  recordedAt: Date;
}

/** The row of the list: who, where they stand and the days; no basis, no handover, no who-recorded. */
export interface OffboardingSummaryRecord {
  id: string;
  employeeId: string;
  state: OffboardingState;
  abrupt: boolean;
  lastWorkingDay: BusinessDate;
  handoverDueOn: BusinessDate | null;
  accountLocked: boolean;
  closed: boolean;
  /** The person headed the department they leave: one of the roles that need someone to take over (`US-03-04` AC-11). */
  headsDepartment: boolean;
}

export interface OffboardingChangeRecord {
  id: string;
  kind: OffboardingChangeKind;
  oldLastWorkingDay: BusinessDate | null;
  newLastWorkingDay: BusinessDate | null;
  reason: string | null;
  detail: Record<string, unknown> | null;
  /** The account, or the ticket of the controlled procedure (spec L.2). */
  changedByAppUserId: string | null;
  changedByTicketId: string | null;
  changedAt: Date;
}

export interface OffboardingListFilter {
  /** Set for an IT Admin: only the cases of these departments. Empty reads nothing. */
  departmentIds?: readonly string[];
  employeeId?: string;
  state?: OffboardingState;
  pastLastDay?: boolean;
  accountLockMissing?: boolean;
  /** Only the cases whose snapshot of roles, taken when the departure was recorded, has this one. */
  roleFlag?: RoleFlag;
  today: BusinessDate;
  page: number;
  pageSize: number;
}

export interface AccountLockInput {
  note: string;
}

export interface RecordOffboardingInput {
  employeeId: string;
  lastWorkingDay?: BusinessDate | undefined;
  abrupt: boolean;
  grounds?: GroundsInput | undefined;
  successor?: SuccessorChoice | undefined;
  pendingTransferCancellation?: { reason: string } | undefined;
  /** The notice of a head this case is recorded from (`US-03-11`); a case recorded straight from a document has none. */
  noticeId?: string | undefined;
}

export interface ChangeLastDayInput {
  lastWorkingDay: BusinessDate;
  reason: string;
  successor?: SuccessorChoice | undefined;
}

export interface MarkLeftInput {
  departedOn?: BusinessDate | undefined;
  accountLock?: AccountLockInput | undefined;
}

export interface OpenRevocationsInput {
  assignmentIds?: readonly string[] | undefined;
  count: number;
  reason: string;
  accountLock?: AccountLockInput | undefined;
}
