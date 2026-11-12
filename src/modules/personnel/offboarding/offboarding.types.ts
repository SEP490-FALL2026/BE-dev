import type { BusinessDate } from '../../../core/business-date';
import type { RecordedGrounds } from '../personnel-grounds.policy';
import type { RoleFlag } from '../public/personnel.types';

/** How the access of the person is blocked: from the day after the last working day, or from the day the departure is recorded (QĐ-96c). */
export type AccessBlockMode = 'WITH_LAST_DAY' | 'BLOCK_NOW';
export type OffboardingState = 'HANDING_OVER' | 'LEFT' | 'CANCELLED';
export type OffboardingChangeKind =
  | 'RECORDED'
  | 'LAST_DAY_CHANGED'
  | 'CANCELLED'
  | 'MARKED_LEFT'
  | 'ACCOUNT_LOCK_RECORDED'
  | 'REVOCATIONS_OPENED'
  | 'CLOSED'
  | 'ACCESS_BLOCKED'
  | 'REVOCATIONS_WITHDRAWN'
  | 'IT_ADMIN_HANDED_OVER'
  | 'CLOSED_BY_SYSTEM'
  | 'MAILBOX_LOCKED';

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
  departmentId: string | null;
  state: OffboardingState;
  accessBlockMode: AccessBlockMode;
  priorWorkState: PriorWorkState;
  lastWorkingDay: BusinessDate;
  departureEffectiveOn: BusinessDate;
  handoverDueOn: BusinessDate | null;
  /** The day the IT Admin has until to take every right away (`QĐ-110c`); null for a case closed or cancelled before the rule. */
  revocationDueOn: BusinessDate | null;
  grounds: RecordedGrounds;
  headHandover: HeadHandoverFacts | null;
  placementClosedId: string | null;
  cancelledPlacementId: string | null;
  cancelledPlacementDepartmentId: string | null;
  cancelledPlacementFrom: BusinessDate | null;
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
  /** Who recorded it: an account, or the ticket of the controlled procedure: exactly one of the two is set. */
  recordedByAppUserId: string | null;
  recordedByTicketId: string | null;
  recordedAt: Date;
}

/** The row of the list: who, where they stand and the days; no basis, no handover, no who-recorded. */
export interface OffboardingSummaryRecord {
  id: string;
  employeeId: string;
  state: OffboardingState;
  accessBlockMode: AccessBlockMode;
  lastWorkingDay: BusinessDate;
  leftOn: BusinessDate | null;
  accountLocked: boolean;
  closed: boolean;
  /** The day the IT Admin has until to take every right away; null for a case closed or cancelled before the rule (`QĐ-110c`). */
  revocationDueOn: BusinessDate | null;
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
  /** The account, or the ticket of the controlled procedure. */
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
  /** `true`: only the departures past the deadline of their revocations that still have a right without a completed task; `false`: all the others (`QĐ-110c`). */
  revocationOverdue?: boolean;
  /** The ids the service worked out from `revocationOverdue`: only these cases, or every case but these. */
  onlyIds?: readonly string[];
  exceptIds?: readonly string[];
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
  accessBlockMode: AccessBlockMode;
  /** The basis in one box (`QĐ-110a`). */
  groundsNote?: string | undefined;
  successor?: SuccessorChoice | undefined;
  /** The Super Admin confirms that a transfer waiting to take effect after the last working day is cancelled with the departure. */
  cancelPendingTransfer?: true | undefined;
  /** The notice of a head this case is recorded from (`US-03-11`); a case recorded straight from a document has none. */
  noticeId?: string | undefined;
}

export interface ChangeLastDayInput {
  lastWorkingDay: BusinessDate;
  reason: string;
  groundsNote?: string | undefined;
  successor?: SuccessorChoice | undefined;
}

export interface OpenRevocationsInput {
  assignmentIds?: readonly string[] | undefined;
  /** The IT Admin's own words, added to the standard reason of a departure. */
  note?: string | undefined;
  accountLock?: AccountLockInput | undefined;
}
