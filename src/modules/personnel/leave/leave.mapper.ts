import type { BusinessDate } from '../../../core/business-date';
import type { EmployeeRecord } from '../../organization/organization.types';
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

export function toDetail(
  record: LeaveRecord,
  employees: ReadonlyMap<string, EmployeeRecord>,
  today: BusinessDate,
): LeaveDetailWire {
  return {
    ...toSummary(record, employees, today),
    grounds: { ...record.grounds },
    endKind: record.endKind,
    resumesLeaveId: record.resumesLeaveId,
    startedByAppUserId: record.startedByAppUserId,
    startedAt: record.startedAt.toISOString(),
    selfExecuted: record.selfExecuted,
  };
}

export const toChange = (change: LeaveChangeRecord): LeaveChangeWire => ({
  id: change.id,
  kind: change.kind,
  oldReturnOn: change.oldReturnOn,
  newReturnOn: change.newReturnOn,
  returnedOn: change.returnedOn,
  onSchedule: change.onSchedule,
  grounds: change.grounds && { ...change.grounds },
  recordedByAppUserId: change.recordedByAppUserId,
  recordedAt: change.recordedAt.toISOString(),
  selfExecuted: change.selfExecuted,
});
