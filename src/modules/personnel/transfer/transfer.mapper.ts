import type { DepartmentBrief, EmployeeRecord } from '../../organization/organization.types';
import type { TransferChangeWire, TransferDetailWire, TransferRecordedWire, TransferSummaryWire } from './transfer.dto';
import type { TransferChangeRecord, TransferRecord, TransferSummaryRecord, TransferWarning } from './transfer.types';

/** The names a row of the list or a detail shows, read for the whole page in one statement each. */
export interface TransferNames {
  employees: Map<string, EmployeeRecord>;
  departments: Map<string, DepartmentBrief>;
}

const UNKNOWN = '';

function placeOf(names: TransferNames, departmentId: string) {
  const department = names.departments.get(departmentId);

  return { department: { id: departmentId, code: department?.code ?? UNKNOWN, name: department?.name ?? UNKNOWN } };
}

const employeeBrief = (names: TransferNames, employeeId: string) => {
  const employee = names.employees.get(employeeId);

  return { id: employeeId, employeeCode: employee?.employeeCode ?? UNKNOWN, fullName: employee?.fullName ?? UNKNOWN };
};

export function toSummary(record: TransferSummaryRecord, names: TransferNames): TransferSummaryWire {
  return {
    id: record.id,
    employee: employeeBrief(names, record.employeeId),
    from: placeOf(names, record.fromDepartmentId),
    to: placeOf(names, record.toDepartmentId),
    effectiveOn: record.effectiveOn,
    status: record.status,
    selfExecuted: record.selfExecuted,
  };
}

export function toDetail(record: TransferRecord, names: TransferNames): TransferDetailWire {
  const handover = record.headHandover;

  return {
    ...toSummary(record, names),
    grounds: { ...record.grounds },
    headSuccessor: handover && {
      kind: handover.successor,
      employee: handover.successorEmployeeId ? employeeBrief(names, handover.successorEmployeeId) : null,
    },
    recordedByAppUserId: record.recordedByAppUserId,
    recordedAt: record.recordedAt.toISOString(),
    effectiveAt: record.effectiveAt?.toISOString() ?? null,
    cancellation:
      record.cancelledAt && record.cancelledByAppUserId && record.cancelledReason !== null
        ? {
            cancelledAt: record.cancelledAt.toISOString(),
            cancelledByAppUserId: record.cancelledByAppUserId,
            reason: record.cancelledReason,
          }
        : null,
    closure:
      record.closedAt && record.closedByAppUserId
        ? { closedAt: record.closedAt.toISOString(), closedByAppUserId: record.closedByAppUserId }
        : null,
  };
}

export const toRecorded = (
  record: TransferRecord,
  names: TransferNames,
  warnings: TransferWarning[],
): TransferRecordedWire => ({ ...toDetail(record, names), warnings });

export const toChange = (change: TransferChangeRecord): TransferChangeWire => ({
  id: change.id,
  kind: change.kind,
  oldEffectiveOn: change.oldEffectiveOn,
  newEffectiveOn: change.newEffectiveOn,
  reason: change.reason,
  grounds: { ...change.grounds },
  changedByAppUserId: change.changedByAppUserId,
  changedAt: change.changedAt.toISOString(),
});
