import type { BusinessDate } from '../../../core/business-date';
import { DepartmentForbiddenError, type HeadAssignmentProblem } from './department.errors';

/**
 * Who may do what with departments, decided in the service so no route is the only thing between a caller and the data (`F13`).
 * The Super Admin owns the organization's data and changes it on an HR basis; the IT Admin reads a minimum, and only of the
 * departments they answer for (`QĐ-87a`, `QĐ-87b(4)`); a department head reads the one they head (`SoD-2`). Pure: no store, no clock.
 */

/** Changing a department, its head, its successor or its IT Admin in charge, and a project: the Super Admin alone. Throws DepartmentForbiddenError. */
export function assertMayChangeOrganization(roles: readonly string[]): void {
  if (!roles.includes('SUPER_ADMIN')) throw new DepartmentForbiddenError();
}

/**
 * Which departments a caller may list or be warned about: all of them (the Super Admin) or those in their scope (an IT Admin).
 * Any other role reads no list of departments. Throws DepartmentForbiddenError.
 */
export function departmentListScope(roles: readonly string[]): 'ALL' | 'IT_ADMIN_SCOPE' {
  if (roles.includes('SUPER_ADMIN')) return 'ALL';
  if (roles.includes('IT_ADMIN')) return 'IT_ADMIN_SCOPE';

  throw new DepartmentForbiddenError();
}

/** What a read of one department comes to for a caller: let through, or the answer that does not tell the department is there. */
export type DepartmentReadVerdict = 'ALLOWED' | 'NOT_FOUND' | 'OUT_OF_SCOPE' | 'FORBIDDEN';

/**
 * Whether the caller may read the department. The Super Admin reads every one; an IT Admin those in their scope, and for the others
 * the answer is as if it did not exist (not a 403: that would tell it is there); a department head the one they head, and 403 for
 * another. Any other role reads none.
 */
export function departmentReadVerdict(facts: {
  roles: readonly string[];
  headsThisDepartment: boolean;
  inItAdminScope: boolean;
}): DepartmentReadVerdict {
  const { roles } = facts;
  if (roles.includes('SUPER_ADMIN')) return 'ALLOWED';
  if (roles.includes('IT_ADMIN') && facts.inItAdminScope) return 'ALLOWED';
  if (roles.includes('MANAGER') && facts.headsThisDepartment) return 'ALLOWED';
  if (roles.includes('IT_ADMIN')) return 'NOT_FOUND';
  if (roles.includes('MANAGER')) return 'OUT_OF_SCOPE';

  return 'FORBIDDEN';
}

/**
 * Whether the caller may read the people of the department in full: the Super Admin, or the head of that department. The IT Admin
 * is not among them (`departmentTechnicalMemberList` gives them the technical minimum).
 */
export function memberReadVerdict(facts: {
  roles: readonly string[];
  headsThisDepartment: boolean;
}): DepartmentReadVerdict {
  if (facts.roles.includes('SUPER_ADMIN')) return 'ALLOWED';
  if (facts.roles.includes('MANAGER')) return facts.headsThisDepartment ? 'ALLOWED' : 'OUT_OF_SCOPE';

  return 'FORBIDDEN';
}

/** Whether an IT Admin may read the technical view of the department's people: only those in their scope; otherwise as if it were not there. */
export function technicalReadVerdict(facts: {
  roles: readonly string[];
  inItAdminScope: boolean;
}): DepartmentReadVerdict {
  if (!facts.roles.includes('IT_ADMIN')) return 'FORBIDDEN';

  return facts.inItAdminScope ? 'ALLOWED' : 'NOT_FOUND';
}

/** What the scope of an IT Admin is made from: a department and who answers for its technical work. */
export interface ItAdminScopeFacts {
  id: string;
  active: boolean;
  /** The IT Admin named in charge; null when none. */
  itAdminEmployeeId: string | null;
  /** The one named still works and holds the role on an account that can sign in. */
  itAdminUsable: boolean;
}

/**
 * The departments an IT Admin may read: those that name them IT Admin in charge, and the active ones nobody usable is in charge of,
 * whose technical work falls to every IT Admin (the common queue) so they stand in for it.
 */
export function itAdminScope(callerEmployeeId: string, departments: readonly ItAdminScopeFacts[]): ReadonlySet<string> {
  return new Set(
    departments
      .filter(
        (department) =>
          department.itAdminEmployeeId === callerEmployeeId || (department.active && !department.itAdminUsable),
      )
      .map((department) => department.id),
  );
}

/**
 * Whether a successor may be named for the head of a department from `effectiveFrom`: the day is after today, somebody heads the
 * department today, and the person is not that head. The membership, the account and the other rules of heading a department are
 * the ones of naming the head and are judged with it. Null when nothing is wrong.
 */
export function successorProblem(facts: {
  today: BusinessDate;
  effectiveFrom: BusinessDate;
  currentHeadEmployeeId: string | null;
  candidateEmployeeId: string;
}): HeadAssignmentProblem | null {
  if (facts.effectiveFrom <= facts.today) return 'SUCCESSOR_DATE_NOT_FUTURE';
  if (facts.currentHeadEmployeeId === null) return 'SUCCESSOR_NEEDS_A_HEAD';
  if (facts.currentHeadEmployeeId === facts.candidateEmployeeId) return 'SUCCESSOR_IS_THE_HEAD';

  return null;
}
