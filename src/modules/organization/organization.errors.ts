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
