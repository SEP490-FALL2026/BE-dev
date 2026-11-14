import type { BusinessDate } from '../../../core/business-date';
import type { EmployeeRecord } from '../../organization/public/organization.types';
import { groundsNoteOf } from '../personnel-grounds.policy';
import type { ReadAccess } from '../personnel-self-action.policy';
import type { LeaveChangeWire, LeaveDetailWire, LeaveSummaryWire } from './leave.dto';
import { isReturnOverdue } from './leave.policy';
import type { LeaveChangeRecord, LeaveRecord, LeaveSummaryRecord } from './leave.types';

const UNKNOWN = '';

const employeeBrief = (employees: ReadonlyMap<string, EmployeeRecord>, employeeId: string) => {
  const employee = employees.get(employeeId);

  return { id: employeeId, employeeCode: employee?.employeeCode ?? UNKNOWN, fullName: employee?.fullName ?? UNKNOWN };
};

export function toSummary(
  record: LeaveSummaryRecord,
  employees: ReadonlyMap<string, EmployeeRecord>,
  today: BusinessDate,
): LeaveSummaryWire {
  return {
    id: record.id,
    employee: employeeBrief(employees, record.employeeId),
    status: record.status,
    startedOn: record.startedOn,
    approvedReturnOn: record.approvedReturnOn,
    endedOn: record.endedOn,
    overdueReturn: isReturnOverdue(record, today),
  };
}

/** The leave in full for the Super Admin; for the IT Admin without the basis of the approved day. */
export function toDetail(
  record: LeaveRecord,
  employees: ReadonlyMap<string, EmployeeRecord>,
  today: BusinessDate,
  access: ReadAccess = 'FULL',
): LeaveDetailWire {
  return {
    ...toSummary(record, employees, today),
    groundsNote: access === 'FULL' ? groundsNoteOf(record.grounds) : null,
    endKind: record.endKind,
    resumesLeaveId: record.resumesLeaveId,
    startedByAppUserId: record.startedByAppUserId,
    startedByProcedure: record.startedByTicketId !== null,
    startedAt: record.startedAt.toISOString(),
  };
}

export const toChange = (change: LeaveChangeRecord): LeaveChangeWire => ({
  id: change.id,
  kind: change.kind,
  oldReturnOn: change.oldReturnOn,
  newReturnOn: change.newReturnOn,
  returnedOn: change.returnedOn,
  onSchedule: change.onSchedule,
  groundsNote: change.grounds ? groundsNoteOf(change.grounds) : null,
  recordedByAppUserId: change.recordedByAppUserId,
  recordedByProcedure: change.recordedByTicketId !== null,
  recordedAt: change.recordedAt.toISOString(),
});
