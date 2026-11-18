import type { BusinessDate } from '../../../core/business-date';
import type { RecordedGrounds } from '../personnel-grounds.policy';

export type LeaveStatus = 'ACTIVE' | 'ENDED';
export type LeaveEndKind = 'RETURNED' | 'DEPARTURE_STARTED';
export type LeaveChangeKind = 'STARTED' | 'RETURN_DATE_CHANGED' | 'RETURNED' | 'ENDED_FOR_DEPARTURE' | 'RESUMED';

export interface LeaveRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  startedOn: BusinessDate;
  approvedReturnOn: BusinessDate;
  status: LeaveStatus;
  endedOn: BusinessDate | null;
  endKind: LeaveEndKind | null;
  resumesLeaveId: string | null;
  grounds: RecordedGrounds;
  /** Who started it: an account, or the ticket of the controlled procedure: exactly one of the two is set. */
  startedByAppUserId: string | null;
  startedByTicketId: string | null;
  startedAt: Date;
  returnOverdueNoticedFor: BusinessDate | null;
}

/** The row of the list: who, since when, due back when, and whether the day has passed. */
export interface LeaveSummaryRecord {
  id: string;
  employeeId: string;
  status: LeaveStatus;
  startedOn: BusinessDate;
  approvedReturnOn: BusinessDate;
  endedOn: BusinessDate | null;
}

export interface LeaveChangeRecord {
  id: string;
  kind: LeaveChangeKind;
  oldReturnOn: BusinessDate | null;
  newReturnOn: BusinessDate | null;
  returnedOn: BusinessDate | null;
  onSchedule: boolean | null;
  grounds: RecordedGrounds | null;
  /** The account, or the ticket of the controlled procedure. */
  recordedByAppUserId: string | null;
  recordedByTicketId: string | null;
  recordedAt: Date;
}

export interface LeaveListFilter {
  /** Set for an IT Admin: only the leaves of these people (the members of the departments in their charge). Empty reads nothing. */
  employeeIds?: readonly string[];
  status?: LeaveStatus;
  employeeId?: string;
  overdueReturn?: boolean;
  today: BusinessDate;
  page: number;
  pageSize: number;
}

export interface StartLeaveInput {
  employeeId: string;
  startedOn: BusinessDate;
  approvedReturnOn: BusinessDate;
  /** The basis in one box (`QĐ-110a`); the policy refuses it when it is missing, blank, too long or the code of a notice. */
  groundsNote?: string | undefined;
  /** The notice of a head this leave is recorded from (`US-03-11`); a leave recorded straight from a document has none. */
  noticeId?: string;
}

export interface ChangeReturnDateInput {
  newApprovedReturnOn: BusinessDate;
  /** The basis in one box (`QĐ-110a`); the policy refuses it when it is missing, blank, too long or the code of a notice. */
  groundsNote?: string | undefined;
}

export interface ConfirmReturnInput {
  returnedOn: BusinessDate;
  /** The basis in one box (`QĐ-110a`); the policy refuses it when it is missing, blank, too long or the code of a notice. */
  groundsNote?: string | undefined;
}
