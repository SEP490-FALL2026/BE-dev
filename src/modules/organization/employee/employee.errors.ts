/** A row cannot become an employee; carries every reason at once (T-16). */
export class EmployeeRowInvalidError extends Error {
  constructor(readonly reasons: { field: string; code: string }[]) {
    super('The employee row is not valid.');
    this.name = 'EmployeeRowInvalidError';
  }
}
