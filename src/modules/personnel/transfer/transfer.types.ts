import type { BusinessDate } from '../../../core/business-date';
import type { Grounds, GroundsInput } from '../grounds/grounds.policy';

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
  grounds: Grounds;
  /** Who recorded it: an account, or the ticket of the controlled procedure (spec L.2): exactly one of the two is set. */
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
}

/** The row of the list: what identifies the transfer, where it goes and when; no basis, no handover, no who-recorded. */
export interface TransferSummaryRecord {
  id: string;
  employeeId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveOn: BusinessDate;
  status: TransferStatus;
}

export interface TransferChangeRecord {
  id: string;
  kind: 'RESCHEDULED' | 'CANCELLED';
  oldEffectiveOn: BusinessDate;
  newEffectiveOn: BusinessDate | null;
  reason: string;
  grounds: Grounds;
  /** The account, or the ticket of the controlled procedure (spec L.2). */
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
  page: number;
  pageSize: number;
}

export interface RecordTransferInput {
  employeeId: string;
  /** Left out, nothing changes and the policy says so (a notice that names no department). */
  toDepartmentId?: string;
  effectiveOn: BusinessDate;
  grounds?: GroundsInput;
  successor?: SuccessorChoice;
  /** The notice of a head this transfer is recorded from (`US-03-11`); a transfer recorded straight from a document has none. */
  noticeId?: string;
}

export interface ChangeTransferInput {
  reason: string;
  grounds?: GroundsInput;
  /** Moving only: the new day. */
  newEffectiveOn?: BusinessDate;
  /** Moving only: who follows the head on the new day, when the person heads the department they leave. Left out, the one named before stays. */
  successor?: SuccessorChoice;
}

/** A warning the answer carries and that does not stop the transfer: the person owns applications that need another owner. */
export interface TransferWarning {
  code: 'BUSINESS_OWNER_REPLACEMENT_NEEDED';
  applications: { id: string; name: string }[];
  totalApplications: number;
}

/** What a recorded, moved or cancelled transfer answers with. */
export interface TransferOutcome {
  transfer: TransferRecord;
  warnings: TransferWarning[];
}

/** How many applications the warning names; the rest are counted. */
export const WARNING_APPLICATION_LIMIT = 20;
