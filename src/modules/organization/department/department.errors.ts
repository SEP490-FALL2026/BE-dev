import type { UseItem } from '../public/organization-use.types';

export class DepartmentNotFoundError extends Error {
  constructor() {
    super('Department not found.');
    this.name = 'DepartmentNotFoundError';
  }
}

export class DepartmentCodeTakenError extends Error {
  constructor(readonly code: string) {
    super(`A department with the code ${code} already exists.`);
    this.name = 'DepartmentCodeTakenError';
  }
}

export class DepartmentNameInvalidError extends Error {
  constructor() {
    super('A department needs a name of at most 200 characters.');
    this.name = 'DepartmentNameInvalidError';
  }
}

/**
 * The caller does not hold the role the organization's data asks for (`QĐ-87a`): the Super Admin changes departments, heads,
 * successors and the IT Admin in charge, and reads them all; the IT Admin reads the minimum, the head only their own. Raised by
 * the policy in the service, whatever the controller let through (`F13`).
 */
export class DepartmentForbiddenError extends Error {
  constructor() {
    super('You do not have permission to perform this action on departments.');
    this.name = 'DepartmentForbiddenError';
  }
}

/** The person named IT Admin in charge is not an IT Admin who can sign in (US-01-11). */
export class DepartmentItAdminInvalidError extends Error {
  constructor() {
    super('The IT Admin in charge must be an employee with a usable account holding the IT Admin role.');
    this.name = 'DepartmentItAdminInvalidError';
  }
}

export class DepartmentUpdateEmptyError extends Error {
  constructor() {
    super('There is nothing to change.');
    this.name = 'DepartmentUpdateEmptyError';
  }
}

/**
 * What still keeps a department in use, group by group: each holds the first of its things and how many there are in all
 * (`US-03-06` AC-19, `QĐ-90e`, `QĐ-86c`). The first group is the people in it, the second the service accounts it owns, the third the
 * open work (Requests not over, personnel events waiting, tasks open) and the last the subscriptions and purchases it owns that
 * still owe a payment.
 */
export interface DepartmentInUseGroups {
  members: { items: { employeeCode: string; fullName: string }[]; total: number };
  serviceAccounts: { items: { assignmentId: string; accountIdentifier: string }[]; total: number };
  openWork: { items: UseItem[]; total: number };
  subscriptions: { items: UseItem[]; total: number };
}

/** Something still keeps the department in use, so it cannot be retired. */
export class DepartmentInUseError extends Error {
  constructor(readonly groups: DepartmentInUseGroups) {
    super('The department still has members, service accounts, open work or subscriptions that owe a payment.');
    this.name = 'DepartmentInUseError';
  }
}

/** An inactive department takes no new head or member. */
export class DepartmentInactiveError extends Error {
  constructor() {
    super('The department is no longer in use.');
    this.name = 'DepartmentInactiveError';
  }
}

export type HeadAssignmentProblem =
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_NOT_ACTIVE'
  | 'NOT_A_MEMBER_ON_DATE'
  | 'SUPER_ADMIN_CANNOT_HEAD'
  | 'DATE_IN_PAST'
  | 'HEADS_ANOTHER_DEPARTMENT'
  /** A successor takes over from a day after today. */
  | 'SUCCESSOR_DATE_NOT_FUTURE'
  /** A successor follows a head: nobody heads the department today, so the person is named its head instead. */
  | 'SUCCESSOR_NEEDS_A_HEAD'
  /** The person named successor already heads the department. */
  | 'SUCCESSOR_IS_THE_HEAD'
  /** A successor is already named: take them back first (a state of the department, so 409, not a fault of the request). */
  | 'SUCCESSOR_ALREADY_NAMED';

/** Why a person cannot head the department from the date asked, or follow its head (US-03-06 AC-5 → AC-8, AC-18; `QĐ-87` `D-5`). */
export class HeadAssignmentError extends Error {
  constructor(readonly problem: HeadAssignmentProblem) {
    super(`The head cannot be assigned: ${problem}.`);
    this.name = 'HeadAssignmentError';
  }
}

/** The caller is a department head, but not of this department (US-03-06 AC-17). */
export class DepartmentOutOfScopeError extends Error {
  constructor() {
    super('This department is not yours.');
    this.name = 'DepartmentOutOfScopeError';
  }
}

/**
 * No module reads one group of what keeps a department or a Cost Center in use, so retiring it could pass what the organization
 * cannot see: a configuration error that fails loudly instead of letting the retirement through.
 */
export class UseReaderMissingError extends Error {
  constructor(readonly group: string) {
    super(`No module reads ${group}, which keeps a department or a Cost Center in use.`);
    this.name = 'UseReaderMissingError';
  }
}
