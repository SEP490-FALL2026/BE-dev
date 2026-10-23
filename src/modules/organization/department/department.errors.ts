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

export type DepartmentCostCenterProblem = 'NOT_FOUND' | 'NOT_UNIT' | 'TAKEN' | 'INACTIVE';

/** The Cost Center chosen for a new department cannot be used (US-04-09 AC-5, AC-7; US-03-06 AC-2). */
export class DepartmentCostCenterError extends Error {
  constructor(readonly problem: DepartmentCostCenterProblem) {
    super(`The cost center cannot be used for a department: ${problem}.`);
    this.name = 'DepartmentCostCenterError';
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

/** Still has people or service accounts, so it cannot be retired (US-03-06 AC-19). Open work arrives with its slice. */
export class DepartmentInUseError extends Error {
  constructor(
    readonly members: { employeeCode: string; fullName: string }[],
    readonly totalMembers: number,
    /** The first of the service accounts the department owns, still open (`QĐ-86c`); the total counts them all. */
    readonly serviceAccounts: { assignmentId: string; accountIdentifier: string }[] = [],
    readonly totalServiceAccounts: number = 0,
  ) {
    super('The department still has members or service accounts.');
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
  | 'HEADS_ANOTHER_DEPARTMENT';

/** Why a person cannot head the department from the date asked (US-03-06 AC-5 → AC-8, AC-18). */
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
