/** Errors the organization facade throws that other modules may catch. */
export class EmployeeNotFoundError extends Error {
  constructor(readonly employeeId: string) {
    super(`Employee not found: ${employeeId}`);
    this.name = 'EmployeeNotFoundError';
  }
}

// Thrown by the facade when a person's code or work email is already taken; callers outside the module catch them here.
export { EmployeeCodeTakenError, EmployeeEmailTakenError } from './errors/organization.errors';
