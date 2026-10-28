import type { DepartmentBrief, EmployeeRecord } from '../../organization/organization.types';
import type { ReadAccess } from '../personnel-self-action.policy';
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
  };
}

/**
 * The transfer in full for the Super Admin; for the IT Admin only the minimal projection (F12): the people, the departments, the day
 * and the state the technical work needs, without the basis, the handover of the head or the reason of a cancellation.
 */
export function toDetail(
  record: TransferRecord,
  names: TransferNames,
  access: ReadAccess = 'FULL',
): TransferDetailWire {
  const handover = record.headHandover;
  const full = access === 'FULL';

  return {
    ...toSummary(record, names),
    grounds: full ? { ...record.grounds } : null,
    headSuccessor:
      full && handover
        ? {
            kind: handover.successor,
            employee: handover.successorEmployeeId ? employeeBrief(names, handover.successorEmployeeId) : null,
          }
        : null,
    recordedByAppUserId: record.recordedByAppUserId,
    recordedByProcedure: record.recordedByTicketId !== null,
    recordedAt: record.recordedAt.toISOString(),
    effectiveAt: record.effectiveAt?.toISOString() ?? null,
    cancellation:
      full && record.cancelledAt && record.cancelledReason !== null
        ? {
            cancelledAt: record.cancelledAt.toISOString(),
            cancelledByAppUserId: record.cancelledByAppUserId,
            cancelledByProcedure: record.cancelledByTicketId !== null,
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
  changedByProcedure: change.changedByTicketId !== null,
  changedAt: change.changedAt.toISOString(),
});
