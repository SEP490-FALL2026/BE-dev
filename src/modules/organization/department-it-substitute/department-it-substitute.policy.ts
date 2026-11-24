import { IT_ADMIN_DEPARTMENT_LIMIT } from '../department/department.policy';
import { DepartmentItSubstituteForbiddenError } from './department-it-substitute.errors';

export interface ActingItAdminsResult {
  inCharge: string | null;
  substitute: string | null;
  defaultAssignee: string | null;
  actors: string[];
}

/**
 * Resolves who may currently perform technical work for a department: only the usable IT Admin in charge and any
 * usable appointed substitute, excluding a departing employee when applicable. An empty `actors` list leaves work
 * waiting for a Super Admin appointment rather than falling back to a common queue.
 */
export function actingItAdmins(facts: {
  inCharge: string | null;
  inChargeUsable: boolean;
  substitute: string | null;
  substituteUsable: boolean;
  leaverId?: string | null;
}): ActingItAdminsResult {
  const inCharge =
    facts.inCharge !== null && facts.inChargeUsable && facts.inCharge !== facts.leaverId ? facts.inCharge : null;
  const substitute =
    facts.substitute !== null && facts.substituteUsable && facts.substitute !== facts.leaverId
      ? facts.substitute
      : null;

  const actors: string[] = [];
  if (inCharge !== null) actors.push(inCharge);
  if (substitute !== null && substitute !== inCharge) actors.push(substitute);

  return {
    inCharge,
    substitute,
    defaultAssignee: substitute ?? inCharge,
    actors,
  };
}

export type AppointSubstituteVerdict =
  'OK' | 'MISSING_DEPARTMENT' | 'INACTIVE_DEPARTMENT' | 'ALREADY_ACTIVE' | 'NOT_USABLE_IT_ADMIN' | 'IS_IN_CHARGE';

/** Validates a temporary substitute appointment without enforcing the 4-department in-charge cap. */
export function judgeAppoint(facts: {
  departmentExists: boolean;
  departmentActive: boolean;
  hasActiveSubstitute: boolean;
  currentInChargeEmployeeId: string | null;
  candidateEmployeeId: string;
  candidateIsUsableItAdmin: boolean;
}): AppointSubstituteVerdict {
  if (!facts.departmentExists) return 'MISSING_DEPARTMENT';
  if (!facts.departmentActive) return 'INACTIVE_DEPARTMENT';
  if (facts.hasActiveSubstitute) return 'ALREADY_ACTIVE';
  if (!facts.candidateIsUsableItAdmin) return 'NOT_USABLE_IT_ADMIN';
  if (facts.currentInChargeEmployeeId === facts.candidateEmployeeId) return 'IS_IN_CHARGE';

  return 'OK';
}

export interface ItAdminLoad {
  employeeId: string;
  inChargeCount: number;
  substituteCount: number;
  overLimit: boolean;
}

/** Computes soft-limit load telemetry returned as a warning after appointment or in-charge updates. */
export function itAdminLoadOf(facts: {
  employeeId: string;
  inChargeCount: number;
  substituteCount: number;
  limit?: number;
}): ItAdminLoad {
  const limit = facts.limit ?? IT_ADMIN_DEPARTMENT_LIMIT;

  return {
    employeeId: facts.employeeId,
    inChargeCount: facts.inChargeCount,
    substituteCount: facts.substituteCount,
    overLimit: facts.inChargeCount + facts.substituteCount > limit,
  };
}

/** Only the Super Admin appoints or ends temporary department IT Admin substitutes. */
export function assertMayManageItSubstitutes(roles: readonly string[]): void {
  if (!roles.includes('SUPER_ADMIN')) throw new DepartmentItSubstituteForbiddenError();
}

/** Super Admin lists all substitute appointments; IT Admin lists those within their scope or naming them. */
export function itSubstituteListScope(roles: readonly string[]): 'ALL' | 'IT_ADMIN_SCOPE' {
  if (roles.includes('SUPER_ADMIN')) return 'ALL';
  if (roles.includes('IT_ADMIN')) return 'IT_ADMIN_SCOPE';

  throw new DepartmentItSubstituteForbiddenError();
}
