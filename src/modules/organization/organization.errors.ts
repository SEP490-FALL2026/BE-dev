/** Errors the organization facade throws that other modules may catch. */
export class EmployeeNotFoundError extends Error {
  constructor(readonly employeeId: string) {
    super(`Employee not found: ${employeeId}`);
    this.name = 'EmployeeNotFoundError';
  }
}
