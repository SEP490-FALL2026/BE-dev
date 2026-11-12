import type { EmployeeRecord, DepartmentBrief } from '../../organization/public/organization.types';
import type { PersonalSeat } from '../../licensing/public/licensing.types';
import type { HandoverDutyBrief } from '../../licensing/public/licensing-handover.types';
import type {
  OffboardingChangeWire,
  OffboardingDetailWire,
  OffboardingRightWire,
  OffboardingSummaryWire,
} from './offboarding.dto';
import { groundsNoteOf } from '../personnel-grounds.policy';
import type { ReadAccess } from '../personnel-self-action.policy';
import { ROLE_FLAGS, type RoleFlagMap } from '../public/personnel.types';
import type { Checklist } from './offboarding.policy';
import type { OffboardingChangeRecord, OffboardingRecord, OffboardingSummaryRecord } from './offboarding.types';
import {
  accessBlockedFrom,
  isBlocked,
  isPastLastDay,
  isRevocableType,
  ownBlock,
  type DepartureBlock,
} from './offboarding.policy';

const UNKNOWN = '';

/** The person holds none of the roles: a case that was cancelled no longer calls for anyone to take them over. */
const NO_ROLES = Object.fromEntries(ROLE_FLAGS.map((flag) => [flag, false])) as RoleFlagMap;

const brief = (employees: ReadonlyMap<string, EmployeeRecord>, id: string) => {
  const employee = employees.get(id);

  return { id, employeeCode: employee?.employeeCode ?? UNKNOWN, fullName: employee?.fullName ?? UNKNOWN };
};

export function toSummary(
  record: OffboardingSummaryRecord,
  employees: ReadonlyMap<string, EmployeeRecord>,
  facts: {
    today: string;
    heldRights: number;
    roleFlags?: RoleFlagMap | undefined;
    /** The block the departure put on the access of the person, if any. */
    block?: DepartureBlock | null | undefined;
  },
): OffboardingSummaryWire {
  const block = ownBlock(facts.block, record.id);
  const accessBlocked = isBlocked(record, block, facts.today);

  return {
    id: record.id,
    employee: brief(employees, record.employeeId),
    state: record.state,
    accessBlockMode: record.accessBlockMode,
    abrupt: record.accessBlockMode === 'BLOCK_NOW',
    lastWorkingDay: record.lastWorkingDay,
    handoverDueOn: record.handoverDueOn,
    pastLastDay: isPastLastDay(record.state, record.lastWorkingDay, facts.today),
    accessBlocked,
    accessBlockedFrom: accessBlockedFrom(record, block),
    heldRights: facts.heldRights,
    // A handover that is already blocked is waiting for the IT Admin to lock the account like a departure that has happened (L3).
    accountLockMissing: (record.state === 'LEFT' || accessBlocked) && !record.accountLocked && !record.closed,
    closed: record.closed,
    roleFlags: facts.roleFlags ?? NO_ROLES,
  };
}

export interface DetailFacts {
  today: string;
  heldRights: number;
  roleFlags?: RoleFlagMap | undefined;
  block?: DepartureBlock | null | undefined;
  /** The workspaces of K2 plans the person owns or administers, by plan id with the names. */
  workspaces: Record<string, string>;
  checklist: Checklist | null;
  blockers: Record<string, number>;
  registeredWarnings: Record<string, number>;
}

/** Both moments are taken inside one transaction when the person is left as the departure is recorded. */
const SAME_TRANSACTION_MS = 10_000;

/**
 * Who marked the person left. A sudden departure the controlled procedure recorded is `LEFT` at once, and the column that says who
 * marked it holds the stand-in account the database demands (see `TransferGuardService.standIn`): it is never shown, the answer
 * says it was the procedure.
 */
function leftOf(leftOn: string, leftAt: Date, record: OffboardingRecord) {
  // The controlled procedure records a departure blocked now and, when its last working day is not ahead, leaves the person in the same
  // transaction: the moment of leaving is then the moment of recording. A person the Super Admin marks left later is theirs.
  const byProcedure =
    record.recordedByTicketId !== null &&
    record.accessBlockMode === 'BLOCK_NOW' &&
    leftAt.getTime() - record.recordedAt.getTime() < SAME_TRANSACTION_MS;

  return {
    leftOn,
    leftAt: leftAt.toISOString(),
    leftByAppUserId: byProcedure ? null : record.leftByAppUserId,
    leftByProcedure: byProcedure,
  };
}

export function toDetail(
  record: OffboardingRecord,
  employees: ReadonlyMap<string, EmployeeRecord>,
  department: DepartmentBrief | undefined,
  facts: DetailFacts,
  access: ReadAccess = 'FULL',
): OffboardingDetailWire {
  const handover = record.headHandover;
  const locked = record.accountLockAt !== null;
  const full = access === 'FULL';

  return {
    ...toSummary(
      {
        id: record.id,
        employeeId: record.employeeId,
        state: record.state,
        accessBlockMode: record.accessBlockMode,
        lastWorkingDay: record.lastWorkingDay,
        leftOn: record.leftOn,
        handoverDueOn: record.handoverDueOn,
        accountLocked: locked,
        closed: record.closedAt !== null,
        headsDepartment: record.headHandover !== null,
      },
      employees,
      facts,
    ),
    department: record.departmentId
      ? {
          id: record.departmentId,
          code: department?.code ?? UNKNOWN,
          name: department?.name ?? UNKNOWN,
        }
      : null,
    priorWorkState: record.priorWorkState,
    departureEffectiveOn: record.departureEffectiveOn,
    groundsNote: full ? groundsNoteOf(record.grounds) : null,
    headSuccessor:
      full && handover
        ? {
            kind: handover.successor,
            employee: handover.successorEmployeeId ? brief(employees, handover.successorEmployeeId) : null,
          }
        : null,
    recordedByAppUserId: record.recordedByAppUserId,
    recordedByProcedure: record.recordedByTicketId !== null,
    recordedAt: record.recordedAt.toISOString(),
    left: record.leftOn && record.leftAt ? leftOf(record.leftOn, record.leftAt, record) : null,
    cancellation:
      full && record.cancelledAt && record.cancelReason !== null
        ? {
            cancelledAt: record.cancelledAt.toISOString(),
            cancelledByAppUserId: record.cancelledByAppUserId,
            cancelledByProcedure: record.cancelledByTicketId !== null,
            reason: record.cancelReason,
          }
        : null,
    accountLock:
      record.accountLockAt && record.accountLockByAppUserId && record.accountLockNote !== null
        ? {
            recordedAt: record.accountLockAt.toISOString(),
            recordedByAppUserId: record.accountLockByAppUserId,
            note: record.accountLockNote,
          }
        : null,
    closure:
      record.closedAt && record.closedByAppUserId
        ? { closedAt: record.closedAt.toISOString(), closedByAppUserId: record.closedByAppUserId }
        : null,
    checklist: facts.checklist,
    blockers: facts.blockers,
    warnings: {
      // From the day the person is no longer a member nobody heads the department, unless somebody was chosen to follow.
      departmentWithoutHeadFrom: handover && handover.successorEmployeeId === null ? record.departureEffectiveOn : null,
      accountLockNotRecorded: record.state === 'LEFT' && !locked && record.closedAt === null,
      workspaces: facts.workspaces,
      registered: facts.registeredWarnings,
    },
  };
}

export function toRight(
  seat: PersonalSeat,
  facts: {
    duty: HandoverDutyBrief | undefined;
    accessRunsOnUntil: string | undefined;
    employees: ReadonlyMap<string, EmployeeRecord>;
  },
): OffboardingRightWire {
  const duty = facts.duty;

  return {
    assignmentId: seat.assignmentId,
    application: { id: seat.applicationId, name: seat.applicationName },
    plan: { id: seat.planId, name: seat.planName },
    provisioningType: seat.provisioningType,
    revocationNote: seat.revocationNote,
    dataLossOnRemoval: seat.dataLossOnRemoval,
    grantReason: seat.grantReason,
    effectiveFrom: seat.effectiveFrom,
    validUntil: seat.validUntil,
    revocable: isRevocableType(seat.provisioningType),
    revocation: seat.revocation && {
      taskId: seat.revocation.taskId,
      status: seat.revocation.status,
      source: seat.revocation.source,
    },
    accessRunsOnUntil: facts.accessRunsOnUntil ?? null,
    handover: duty
      ? {
          dutyId: duty.dutyId,
          status: duty.status,
          role: duty.role,
          confirmer: duty.confirmerEmployeeId ? brief(facts.employees, duty.confirmerEmployeeId) : null,
          waitingReason: duty.waitingReason,
          dueOn: duty.dueOn,
          overdue: duty.overdue,
          flaggedUnconfirmed: duty.flaggedUnconfirmed,
        }
      : null,
  };
}

export function toChange(change: OffboardingChangeRecord): OffboardingChangeWire {
  const count = change.detail?.count;

  return {
    id: change.id,
    kind: change.kind,
    oldLastWorkingDay: change.oldLastWorkingDay,
    newLastWorkingDay: change.newLastWorkingDay,
    reason: change.reason,
    count: change.kind === 'REVOCATIONS_OPENED' && typeof count === 'number' ? count : null,
    changedByAppUserId: change.changedByAppUserId,
    changedByProcedure: change.changedByTicketId !== null,
    changedAt: change.changedAt.toISOString(),
  };
}
