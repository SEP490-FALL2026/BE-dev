import { UnplacedWorkDesignationForbiddenError } from './unplaced-work-designation.errors';

export type AppointUnplacedWorkVerdict =
  'OK' | 'MISSING_EMPLOYEE' | 'EMPLOYEE_PLACED' | 'NOT_USABLE_IT_ADMIN' | 'ALREADY_ACTIVE';

/** Evaluates preconditions for appointing an IT Admin designee for works of an unplaced employee. */
export function judgeAppointUnplacedWork(facts: {
  employeeExists: boolean;
  employeeHasAnyPlacement: boolean;
  designeeIsUsableItAdmin: boolean;
  hasAnyActiveDesignation: boolean;
}): AppointUnplacedWorkVerdict {
  if (!facts.employeeExists) return 'MISSING_EMPLOYEE';
  if (facts.employeeHasAnyPlacement) return 'EMPLOYEE_PLACED';
  if (!facts.designeeIsUsableItAdmin) return 'NOT_USABLE_IT_ADMIN';
  if (facts.hasAnyActiveDesignation) return 'ALREADY_ACTIVE';

  return 'OK';
}

/**
 * Resolves the acting designee for a single unplaced work item. Returns the designee id only when the designation
 * matches the work's employee, the employee has never been placed in a department, and the designee is active and usable.
 */
export function resolveUnplacedWorkDesignee(facts: {
  designationEmployeeId: string;
  workEmployeeId: string;
  employeeHasAnyPlacement: boolean;
  designeeEmployeeId: string;
  designeeActive: boolean;
  designeeUsable: boolean;
}): string | null {
  if (facts.designationEmployeeId !== facts.workEmployeeId) return null;
  if (facts.employeeHasAnyPlacement) return null;
  if (!facts.designeeActive || !facts.designeeUsable) return null;

  return facts.designeeEmployeeId;
}

/** Only the Super Admin appoints or ends unplaced-work IT Admin designations. */
export function assertMayManageUnplacedWorkDesignations(roles: readonly string[]): void {
  if (!roles.includes('SUPER_ADMIN')) throw new UnplacedWorkDesignationForbiddenError();
}

/** Super Admin lists all designations; IT Admin sees only designations naming them as designee. */
export function unplacedWorkDesignationListScope(roles: readonly string[]): 'ALL' | 'DESIGNEE_ONLY' {
  if (roles.includes('SUPER_ADMIN')) return 'ALL';
  if (roles.includes('IT_ADMIN')) return 'DESIGNEE_ONLY';

  throw new UnplacedWorkDesignationForbiddenError();
}
