/**
 * The record is the IT Admin's own and another IT Admin can do the work: they must (`SoD-5`, `QĐ-77m`). When nobody
 * else can, the IT Admin may, and the Audit Trail says so.
 */
export class EmployeeAnotherItAdminNeededError extends Error {
  constructor() {
    super('Another IT Admin has to change the record of the IT Admin who is its subject.');
    this.name = 'EmployeeAnotherItAdminNeededError';
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
