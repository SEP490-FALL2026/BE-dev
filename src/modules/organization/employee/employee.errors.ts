/**
 * The caller is not the Super Admin: employee records are entered and corrected by the Super Admin alone, on an HR basis (`QĐ-87a`),
 * decided in the service whatever the route let through (`F13`).
 */
export class EmployeeForbiddenError extends Error {
  constructor() {
    super('You do not have permission to perform this action on employee records.');
    this.name = 'EmployeeForbiddenError';
  }
}

/**
 * Nobody changes their own record here (`QĐ-87c`, `F19`): when the Super Admin is the subject, the change is made through the
 * controlled procedure outside the application and nothing is written by this route.
 */
export class EmployeeSelfChangeForbiddenError extends Error {
  constructor() {
    super(
      'You cannot change your own employee record. A change to the record of the Super Admin is made through the controlled procedure: pnpm ops:record-super-admin-event profile-correct.',
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

/** A row cannot become an employee; carries every reason at once (T-16). */
export class EmployeeRowInvalidError extends Error {
  constructor(readonly reasons: { field: string; code: string }[]) {
    super('The employee row is not valid.');
    this.name = 'EmployeeRowInvalidError';
  }
}
