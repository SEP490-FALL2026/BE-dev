import type { BusinessDate } from '../../../core/business-date';
import { ROLE_FLAGS, type RoleFlag, type RoleFlagMap } from '../personnel.types';

/** What is read of one person to say which roles they hold. */
export interface RoleFacts {
  superAdmin: boolean;
  finance: boolean;
  spendingApprover: boolean;
  substituteApprover: boolean;
  fallbackApprover: boolean;
  /** How many active departments name the person IT Admin in charge. */
  itAdminDepartments: number;
  headsDepartment: boolean;
  /** How many workspaces of K2 plans the person owns or administers. */
  workspaces: number;
}

/** The flags of a person, in the order of `ROLE_FLAGS`. */
export function flagsOf(facts: RoleFacts): RoleFlag[] {
  const held: Record<RoleFlag, boolean> = {
    SUPER_ADMIN_HOLDER: facts.superAdmin,
    FINANCE: facts.finance,
    SPENDING_APPROVER: facts.spendingApprover,
    SUBSTITUTE_APPROVER: facts.substituteApprover,
    FALLBACK_APPROVER: facts.fallbackApprover,
    IT_ADMIN_IN_CHARGE: facts.itAdminDepartments > 0,
    DEPARTMENT_HEAD: facts.headsDepartment,
    WORKSPACE_OWNER: facts.workspaces > 0,
  };

  return ROLE_FLAGS.filter((flag) => held[flag]);
}

/** Every flag with whether it is held: the shape the wire gives, which has no list. */
export function flagMap(flags: readonly RoleFlag[]): RoleFlagMap {
  const held = new Set<RoleFlag>(flags);

  return Object.fromEntries(ROLE_FLAGS.map((flag) => [flag, held.has(flag)])) as RoleFlagMap;
}

/** The Super Admin role and a workspace left without an owner are the two that call for the highest priority of the alert. */
export const isHighPriority = (flags: readonly RoleFlag[]): boolean =>
  flags.includes('SUPER_ADMIN_HOLDER') || flags.includes('WORKSPACE_OWNER');

/** Whether two sets of flags are the same set, whatever their order. */
export const sameFlags = (a: readonly RoleFlag[], b: readonly RoleFlag[]): boolean =>
  a.length === b.length && a.every((flag) => b.includes(flag));

/**
 * How far a departure has come, for the person who leaves (`US-03-04` AC-12): they are leaving, or the last working day has passed and
 * the departure is not recorded yet. A change of level never takes anything away: the account is refused by the state, not by the day.
 */
export type DepartureLevel = 'LEAVING' | 'OVERDUE_HANDOVER';

export function departureLevel(
  facts: { state: 'HANDING_OVER' | 'LEFT'; lastWorkingDay: BusinessDate },
  today: BusinessDate,
): DepartureLevel {
  return facts.state === 'HANDING_OVER' && today > facts.lastWorkingDay ? 'OVERDUE_HANDOVER' : 'LEAVING';
}

export type SuperAdminStatus = 'HEALTHY' | 'HOLDER_LEAVING_STILL_USABLE' | 'HOLDER_UNUSABLE' | 'NO_HOLDER';
export type UnusableReason = 'LOCKED' | 'LEFT' | 'NOT_ACTIVATED' | 'AWAITING_CREDENTIAL_RESET';
export type LeavingWarning = 'HOLDER_LEAVING' | 'HANDOVER_OVERDUE';

/** The holder of the Super Admin role as it is read: the account and the employee behind it. */
export interface HolderFacts {
  locked: boolean;
  activated: boolean;
  awaitingCredentialReset: boolean;
  employeeTerminated: boolean;
  workState: 'WORKING' | 'ON_LONG_LEAVE' | 'HANDING_OVER' | 'LEFT';
}

export interface SuperAdminAssessment {
  status: SuperAdminStatus;
  /** Why the holder cannot act; every reason is present, true or false, and none is true unless the status is `HOLDER_UNUSABLE`. */
  reasons: Record<UnusableReason, boolean>;
  warnings: Record<LeavingWarning, boolean>;
}

const NO_REASONS: Record<UnusableReason, boolean> = {
  LOCKED: false,
  LEFT: false,
  NOT_ACTIVATED: false,
  AWAITING_CREDENTIAL_RESET: false,
};

/**
 * The four states of the Super Admin role told apart (`US-03-04` AC-13), from the one person who holds it: nobody holds it; the holder
 * cannot act (locked, has left, not activated, waiting for the reset of an operator); the holder is handing over and still can act,
 * even past the last working day; or all is well. The day never makes a holder unusable: only the account and the state of the person do.
 */
export function assessSuperAdmin(
  holder: HolderFacts | null,
  handover: { lastWorkingDay: BusinessDate } | null,
  today: BusinessDate,
): SuperAdminAssessment {
  const noWarnings = { HOLDER_LEAVING: false, HANDOVER_OVERDUE: false };
  if (!holder) return { status: 'NO_HOLDER', reasons: NO_REASONS, warnings: noWarnings };

  const reasons: Record<UnusableReason, boolean> = {
    LOCKED: holder.locked,
    LEFT: holder.employeeTerminated || holder.workState === 'LEFT',
    NOT_ACTIVATED: !holder.activated,
    AWAITING_CREDENTIAL_RESET: holder.awaitingCredentialReset,
  };
  if (Object.values(reasons).some(Boolean)) return { status: 'HOLDER_UNUSABLE', reasons, warnings: noWarnings };
  if (holder.workState === 'HANDING_OVER') {
    return {
      status: 'HOLDER_LEAVING_STILL_USABLE',
      reasons: NO_REASONS,
      warnings: { HOLDER_LEAVING: true, HANDOVER_OVERDUE: handover !== null && today > handover.lastWorkingDay },
    };
  }

  return { status: 'HEALTHY', reasons: NO_REASONS, warnings: noWarnings };
}
