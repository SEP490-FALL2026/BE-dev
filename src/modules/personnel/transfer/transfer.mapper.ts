import type { DepartmentBrief, EmployeeRecord } from '../../organization/organization.types';
import type { OrganizationService } from '../../organization/organization.service';
import type { TransferChangeWire, TransferDetailWire, TransferRecordedWire, TransferSummaryWire } from './transfer.dto';
import type { TransferChangeRecord, TransferRecord, TransferSummaryRecord, TransferWarning } from './transfer.types';

/** The names a row of the list or a detail shows, read for the whole page in one statement each. */
export interface TransferNames {
  employees: Map<string, EmployeeRecord>;
  departments: Map<string, DepartmentBrief>;
  jobTitles: Map<string, JobTitleRecord>;
}

type JobTitleRecord = Awaited<ReturnType<OrganizationService['getJobTitles']>>[number];

const UNKNOWN = '';

function placeOf(names: TransferNames, departmentId: string, jobTitleId: string) {
  const department = names.departments.get(departmentId);
  const jobTitle = names.jobTitles.get(jobTitleId);

  return {
    department: { id: departmentId, code: department?.code ?? UNKNOWN, name: department?.name ?? UNKNOWN },
    jobTitle: { id: jobTitleId, name: jobTitle?.name ?? UNKNOWN },
  };
}

const employeeBrief = (names: TransferNames, employeeId: string) => {
  const employee = names.employees.get(employeeId);

  return { id: employeeId, employeeCode: employee?.employeeCode ?? UNKNOWN, fullName: employee?.fullName ?? UNKNOWN };
};

export function toSummary(record: TransferSummaryRecord, names: TransferNames): TransferSummaryWire {
  const department = record.fromDepartmentId !== record.toDepartmentId;
  const jobTitle = record.fromJobTitleId !== record.toJobTitleId;

  return {
    id: record.id,
    employee: employeeBrief(names, record.employeeId),
    changes: department ? (jobTitle ? 'DEPARTMENT_AND_JOB_TITLE' : 'DEPARTMENT') : 'JOB_TITLE',
    from: placeOf(names, record.fromDepartmentId, record.fromJobTitleId),
    to: placeOf(names, record.toDepartmentId, record.toJobTitleId),
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
