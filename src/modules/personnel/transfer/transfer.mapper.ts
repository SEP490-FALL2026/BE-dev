import type { BusinessDate } from '../../../core/business-date';
import type { DepartmentBrief, EmployeeRecord } from '../../organization/public/organization.types';
import type { ItHandoverWire } from '../it-handover/it-handover.dto';
import { groundsNoteOf } from '../personnel-grounds.policy';
import type { ReadAccess } from '../personnel-self-action.policy';
import type { OldRightWire, TransferSnapshotWire } from '../transfer-grace/transfer-grace.dto';
import { transferPhase } from '../transfer-grace/transfer-grace.policy';
import type { TransferChangeWire, TransferDetailWire, TransferRecordedWire, TransferSummaryWire } from './transfer.dto';
import type { TransferChangeRecord, TransferRecord, TransferSummaryRecord } from './transfer.types';

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

export function toSummary(
  record: TransferSummaryRecord,
  names: TransferNames,
  today: BusinessDate,
): TransferSummaryWire {
  return {
    id: record.id,
    employee: employeeBrief(names, record.employeeId),
    from: placeOf(names, record.fromDepartmentId),
    to: placeOf(names, record.toDepartmentId),
    effectiveOn: record.effectiveOn,
    status: record.status,
    phase: transferPhase(record, today),
    grace:
      record.graceEndsOn !== null && record.graceReminderOn !== null
        ? { endsOn: record.graceEndsOn, reminderOn: record.graceReminderOn }
        : null,
  };
}

/** What the detail needs besides the record and the names: the day it is read and the old rights, read from the licensing context. */
export interface TransferDetailExtras {
  today: BusinessDate;
  oldRights: OldRightWire[];
  /** What the person answers for in the catalog and the hand-over of it; null when there is nothing. */
  itHandover: ItHandoverWire | null;
}

const snapshotOf = (record: TransferRecord): TransferSnapshotWire | null =>
  record.snapshotBefore === null && record.snapshotAfter === null
    ? null
    : {
        before: record.snapshotBefore && {
          takenOn: record.snapshotBefore.takenOn,
          rights: record.snapshotBefore.rights.map((right) => ({
            assignmentId: right.assignmentId,
            applicationName: right.applicationName,
            planName: right.planName,
            provisioningType: right.provisioningType,
            effectiveFrom: right.effectiveFrom,
            validUntil: right.validUntil,
          })),
        },
        after: record.snapshotAfter,
      };

/**
 * The transfer in full for the Super Admin; for the IT Admin only the minimal projection: the people, the departments, the day
 * and the state the technical work needs, without the basis, the handover of the head or the reason of a cancellation.
 */
export function toDetail(
  record: TransferRecord,
  names: TransferNames,
  access: ReadAccess,
  extras: TransferDetailExtras,
): TransferDetailWire {
  const handover = record.headHandover;
  const full = access === 'FULL';

  return {
    ...toSummary({ ...record, closed: record.closedAt !== null }, names, extras.today),
    groundsNote: full ? groundsNoteOf(record.grounds) : null,
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
    closure: record.closedAt
      ? {
          closedAt: record.closedAt.toISOString(),
          closedByAppUserId: record.closedByAppUserId,
          closedBySystem: record.closedBySystem,
          supersededByCaseId: record.supersededByCaseId,
        }
      : null,
    oldRights: extras.oldRights,
    commitmentsReleased: full ? (record.snapshotBefore?.commitmentsReleased ?? []) : [],
    snapshot: full ? snapshotOf(record) : null,
    itHandover: extras.itHandover,
  };
}

export const toRecorded = (
  record: TransferRecord,
  names: TransferNames,
  extras: TransferDetailExtras,
): TransferRecordedWire => toDetail(record, names, 'FULL', extras);

export const toChange = (change: TransferChangeRecord): TransferChangeWire => ({
  id: change.id,
  kind: change.kind,
  oldEffectiveOn: change.oldEffectiveOn,
  newEffectiveOn: change.newEffectiveOn,
  reason: change.reason,
  groundsNote: groundsNoteOf(change.grounds),
  changedByAppUserId: change.changedByAppUserId,
  changedByProcedure: change.changedByTicketId !== null,
  changedAt: change.changedAt.toISOString(),
});
