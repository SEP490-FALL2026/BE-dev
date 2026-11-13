import type { BusinessDate } from '../../../core/business-date';
import type { RecordedGrounds } from '../personnel-grounds.policy';
import type { TransferSnapshotAfter, TransferSnapshotBefore } from '../transfer-grace/transfer-snapshot.json';

export type TransferStatus = 'PENDING' | 'EFFECTIVE' | 'CANCELLED';

/** Who follows a head who changes department: a member of the old department, or nobody (`US-03-01` AC-8). */
export type SuccessorChoice = { kind: 'EMPLOYEE'; employeeId: string } | { kind: 'NONE' };

/** What a handover of the head of the old department moved, kept with the transfer so a move or a cancellation restores it exactly. */
export interface HeadHandoverFacts {
  endedPeriodId: string;
  endedPeriodValidTo: BusinessDate | null;
  createdPeriodId: string | null;
  successor: 'EMPLOYEE' | 'NONE';
  successorEmployeeId: string | null;
}

export interface TransferRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveOn: BusinessDate;
  status: TransferStatus;
  closesPlacementId: string;
  opensPlacementId: string;
  headHandover: HeadHandoverFacts | null;
  grounds: RecordedGrounds;
  /** Who recorded it: an account, or the ticket of the controlled procedure: exactly one of the two is set. */
  recordedByAppUserId: string | null;
  recordedByTicketId: string | null;
  recordedAt: Date;
  effectiveAt: Date | null;
  cancelledAt: Date | null;
  cancelledByAppUserId: string | null;
  cancelledByTicketId: string | null;
  cancelledReason: string | null;
  closedAt: Date | null;
  closedByAppUserId: string | null;
  /** The system closed it (no account did): once every right of the old department was taken back (`QĐ-110r`). */
  closedBySystem: boolean;
  /** The departure that took the old rights over while the grace lasted and so closed this transfer (`QĐ-110r`); null for every other. */
  supersededByCaseId: string | null;
  /** The last day the person keeps the rights of the old department, and the day they are told once more; null until the transfer took effect. */
  graceEndsOn: BusinessDate | null;
  graceReminderOn: BusinessDate | null;
  remindedAt: Date | null;
  /** The rights the person held the day it took effect, and what became of them when it closed; null for a transfer from before the grace. */
  snapshotBefore: TransferSnapshotBefore | null;
  snapshotAfter: TransferSnapshotAfter | null;
}

/** The row of the list: what identifies the transfer, where it goes and when; no basis, no handover, no who-recorded. */
export interface TransferSummaryRecord {
  id: string;
  employeeId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveOn: BusinessDate;
  status: TransferStatus;
  closed: boolean;
  supersededByCaseId: string | null;
  graceEndsOn: BusinessDate | null;
  graceReminderOn: BusinessDate | null;
}

export interface TransferChangeRecord {
  id: string;
  kind: 'RESCHEDULED' | 'CANCELLED';
  oldEffectiveOn: BusinessDate;
  newEffectiveOn: BusinessDate | null;
  reason: string;
  grounds: RecordedGrounds;
  /** The account, or the ticket of the controlled procedure. */
  changedByAppUserId: string | null;
  changedByTicketId: string | null;
  changedAt: Date;
}

export interface TransferListFilter {
  /** Set for an IT Admin: only the transfers that leave or enter these departments. Empty reads nothing. */
  departmentIds?: readonly string[];
  employeeId?: string;
  status?: TransferStatus;
  effectiveFrom?: BusinessDate;
  effectiveTo?: BusinessDate;
  /** Only the transfers whose grace ends before this day (the ones about to end, or already over and not closed). */
  graceEndsBefore?: BusinessDate;
  page: number;
  pageSize: number;
}

export interface RecordTransferInput {
  employeeId: string;
  /** Left out, nothing changes and the policy says so (a notice that names no department). */
  toDepartmentId?: string;
  effectiveOn: BusinessDate;
  /** The basis in one box (`QĐ-110a`); the policy refuses it when missing, blank, over 500 characters or the code of a notice. */
  groundsNote?: string | undefined;
  successor?: SuccessorChoice;
  /** The notice of a head this transfer is recorded from (`US-03-11`); a transfer recorded straight from a document has none. */
  noticeId?: string;
}

export interface ChangeTransferInput {
  reason: string;
  groundsNote?: string | undefined;
  /** Moving only: the new day. */
  newEffectiveOn?: BusinessDate;
  /** Moving only: who follows the head on the new day, when the person heads the department they leave. Left out, the one named before stays. */
  successor?: SuccessorChoice;
}
