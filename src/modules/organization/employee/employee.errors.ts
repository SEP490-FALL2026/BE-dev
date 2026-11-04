/**
 * The caller is not the Super Admin: employee records are entered and corrected by the Super Admin alone (`QĐ-87a`),
 * decided in the service whatever the route let through.
 */
export class EmployeeForbiddenError extends Error {
  constructor() {
    super('You do not have permission to perform this action on employee records.');
    this.name = 'EmployeeForbiddenError';
  }
}

/**
 * Nobody changes their own record here (`QĐ-87c`): when the Super Admin is the subject, the change is made through the
 * controlled procedure outside the application and nothing is written by this route.
 */
export class EmployeeSelfChangeForbiddenError extends Error {
  constructor() {
    super(
      'You cannot change your own employee record. The Super Admin record is changed with: pnpm ops:record-super-admin-event profile-correct.',
    );
    this.name = 'EmployeeSelfChangeForbiddenError';
  }
}

/** Nothing to change: the request names none of the official fields (`US-02-02` AC-19). */
export class EmployeeUpdateEmptyError extends Error {
  constructor() {
    super('Name at least one official field to change.');
    this.name = 'EmployeeUpdateEmptyError';
  }
}

/** A row cannot become an employee; carries every reason at once. */
export class EmployeeRowInvalidError extends Error {
  constructor(readonly reasons: { field: string; code: string }[]) {
    super(
      'The employee row is not valid: see the reasons (a code is uppercase letters or digits joined by single hyphens).',
    );
    this.name = 'EmployeeRowInvalidError';
  }
}
export class FirstPlacementError extends Error {
  constructor(readonly problem: 'ALREADY_PLACED' | 'EMPLOYEE_INACTIVE' | 'EMPLOYEE_LEAVING' | 'DATE_INVALID') {
    super(
      problem === 'ALREADY_PLACED'
        ? 'The employee already has a placement; a change of department is a transfer.'
        : problem === 'DATE_INVALID'
          ? 'Effective date must be on or after today and hire date.'
          : problem === 'EMPLOYEE_LEAVING'
            ? 'The employee is currently handing over and leaving the organization.'
            : 'Employee must be active and not handing over.',
    );
    this.name = 'FirstPlacementError';
  }
}
