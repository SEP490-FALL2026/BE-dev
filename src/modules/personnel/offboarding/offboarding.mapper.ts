import type { EmployeeRecord, DepartmentBrief } from '../../organization/organization.types';
import type { PersonalSeat } from '../../licensing/licensing.types';
import type { HandoverDutyBrief } from '../../licensing/licensing-handover.types';
import type {
  OffboardingChangeWire,
  OffboardingDetailWire,
  OffboardingRightWire,
  OffboardingSummaryWire,
} from './offboarding.dto';
import { ROLE_FLAGS, type RoleFlagMap } from '../personnel.types';
import type { Checklist } from './offboarding.policy';
import type { OffboardingChangeRecord, OffboardingRecord, OffboardingSummaryRecord } from './offboarding.types';
import { isPastLastDay, isRevocableType } from './offboarding.policy';

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
  facts: { today: string; heldRights: number; roleFlags?: RoleFlagMap | undefined },
): OffboardingSummaryWire {
  return {
    id: record.id,
    employee: brief(employees, record.employeeId),
    state: record.state,
    abrupt: record.abrupt,
    lastWorkingDay: record.lastWorkingDay,
    handoverDueOn: record.handoverDueOn,
    pastLastDay: isPastLastDay(record.state, record.lastWorkingDay, facts.today),
    heldRights: facts.heldRights,
    accountLockMissing: record.state === 'LEFT' && !record.accountLocked && !record.closed,
    closed: record.closed,
    roleFlags: facts.roleFlags ?? NO_ROLES,
  };
}

export interface DetailFacts {
  today: string;
  heldRights: number;
  roleFlags?: RoleFlagMap | undefined;
  /** The workspaces of K2 plans the person owns or administers, by plan id with the names. */
  workspaces: Record<string, string>;
  checklist: Checklist | null;
  blockers: Record<string, number>;
  businessOwnerApplications: number;
  registeredWarnings: Record<string, number>;
}

export function toDetail(
  record: OffboardingRecord,
  employees: ReadonlyMap<string, EmployeeRecord>,
  department: DepartmentBrief | undefined,
  facts: DetailFacts,
): OffboardingDetailWire {
  const handover = record.headHandover;
  const locked = record.accountLockAt !== null;

  return {
    ...toSummary(
      {
        id: record.id,
        employeeId: record.employeeId,
        state: record.state,
        abrupt: record.abrupt,
        lastWorkingDay: record.lastWorkingDay,
        handoverDueOn: record.handoverDueOn,
        accountLocked: locked,
        closed: record.closedAt !== null,
        headsDepartment: record.headHandover !== null,
      },
      employees,
      facts,
    ),
    department: {
      id: record.departmentId,
      code: department?.code ?? UNKNOWN,
      name: department?.name ?? UNKNOWN,
    },
    priorWorkState: record.priorWorkState,
    departureEffectiveOn: record.departureEffectiveOn,
    grounds: { ...record.grounds },
    headSuccessor: handover && {
      kind: handover.successor,
      employee: handover.successorEmployeeId ? brief(employees, handover.successorEmployeeId) : null,
    },
    selfExecuted: record.selfExecuted,
    recordedByAppUserId: record.recordedByAppUserId,
    recordedAt: record.recordedAt.toISOString(),
    left:
      record.leftOn && record.leftAt && record.leftByAppUserId
        ? { leftOn: record.leftOn, leftAt: record.leftAt.toISOString(), leftByAppUserId: record.leftByAppUserId }
        : null,
    cancellation:
      record.cancelledAt && record.cancelledByAppUserId && record.cancelReason !== null
        ? {
            cancelledAt: record.cancelledAt.toISOString(),
            cancelledByAppUserId: record.cancelledByAppUserId,
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
      businessOwnerApplications: facts.businessOwnerApplications,
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
    changedAt: change.changedAt.toISOString(),
    selfExecuted: change.selfExecuted,
  };
}
