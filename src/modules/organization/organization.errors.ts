/** Errors the organization facade throws that other modules may catch. */
export class EmployeeNotFoundError extends Error {
  constructor(readonly employeeId: string) {
    super(`Employee not found: ${employeeId}`);
    this.name = 'EmployeeNotFoundError';
  }
}

/** Thrown by the facade when a person's code is already taken; callers outside the module catch it. */
export class EmployeeCodeTakenError extends Error {
  constructor(readonly employeeCode: string) {
    super(`Employee code already exists: ${employeeCode}`);
    this.name = 'EmployeeCodeTakenError';
  }
}

/** Thrown by the facade when a person's work email is already taken. */
export class EmployeeEmailTakenError extends Error {
  constructor() {
    super('The work email is already used by another employee.');
    this.name = 'EmployeeEmailTakenError';
  }
}

/**
 * Thrown by the facade when PostgreSQL refuses a kind of staff that needs an expected end on every open seat while the
 * person holds an open seat without one (`INV-07`, P28-04).
 */
export class EmployeeOpenSeatNeedsEndError extends Error {
  constructor() {
    super('A contractor, freelancer or intern needs an expected end date on every open seat.');
    this.name = 'EmployeeOpenSeatNeedsEndError';
  }
}

/** Thrown by the facade when a second organization would be created: the installation has exactly one (I-8). */
export class OrganizationAlreadyExistsError extends Error {
  constructor() {
    super('An organization already exists for this installation.');
    this.name = 'OrganizationAlreadyExistsError';
  }
}
