import { EmployeeForbiddenError, EmployeeSelfChangeForbiddenError } from './employee.errors';

/**
 * Who may enter and correct employee records, decided in the service so no route is the only thing between a caller and the data
 *. The Super Admin enters and corrects them, with no HR basis to give (`QĐ-93f`), and never their own (`QĐ-87a`, `QĐ-87c`); the IT Admin, Finance,
 * a head and an employee do not (`US-02-02`). Pure: no store, no clock.
 */

/** Entering a new record, by hand or by file: the Super Admin alone. Throws EmployeeForbiddenError. */
export function assertMayEnterEmployees(roles: readonly string[]): void {
  if (!roles.includes('SUPER_ADMIN')) throw new EmployeeForbiddenError();
}

/**
 * Correcting the official fields of a record: the Super Admin alone, and not the record of the Super Admin who is asking. The role
 * is judged first, so a caller without it learns nothing of whose record is whose. Throws EmployeeForbiddenError or
 * EmployeeSelfChangeForbiddenError (the correction of one's own record goes through the controlled procedure).
 */
export function assertMayCorrectEmployee(
  actor: { roles: readonly string[]; employeeId: string },
  subjectEmployeeId: string,
): void {
  assertMayEnterEmployees(actor.roles);
  if (actor.employeeId === subjectEmployeeId) throw new EmployeeSelfChangeForbiddenError();
}
