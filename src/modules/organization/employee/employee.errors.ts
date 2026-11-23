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
/** The first placement of a person cannot be corrected (`QĐ-113e`); `use` names what refers to it when that is the reason. */
export class FirstPlacementCorrectionError extends Error {
  constructor(
    readonly problem: 'EMPLOYEE_INACTIVE' | 'EMPLOYEE_LEAVING' | 'NOT_PLACED' | 'ALREADY_EFFECTIVE' | 'IN_USE',
    readonly use: 'REQUEST' | 'TRANSFER' | 'HEAD_PERIOD' | 'OFFBOARDING' | null = null,
  ) {
    super(
      problem === 'NOT_PLACED'
        ? 'The employee has no placement to correct; place them for the first time.'
        : problem === 'ALREADY_EFFECTIVE'
          ? 'Only the first placement of a person, before it takes effect, can be corrected; a change of department after that is a transfer.'
          : problem === 'IN_USE'
            ? 'Something already refers to this placement (a Request, a transfer, a period as head or a departure).'
            : problem === 'EMPLOYEE_LEAVING'
              ? 'The employee is currently handing over and leaving the organization.'
              : 'Employee must be active and not handing over.',
    );
    this.name = 'FirstPlacementCorrectionError';
  }
}
/**
 * A module that tells what refers to a first placement is not registered, so "nothing refers to it" cannot be told (`QĐ-113e`): a
 * configuration error, answered 500 rather than letting the correction through.
 */
export class FirstPlacementUseReaderMissingError extends Error {
  constructor(readonly missing: string) {
    super(`The contributor ${missing} of the first placement use is not registered.`);
    this.name = 'FirstPlacementUseReaderMissingError';
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
