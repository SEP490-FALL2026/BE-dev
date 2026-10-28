import { ImportForbiddenError } from './employee-import.errors';

/**
 * Who may upload, judge, confirm, cancel and read a people file, decided in the service so no route is the only thing between a
 * caller and the people it holds (`F13`): the Super Admin alone, on an HR basis (`QĐ-87a`, `US-02-01`). Pure: no store, no clock.
 */

/** Throws ImportForbiddenError for any caller who is not the Super Admin. */
export function assertMayImportEmployees(roles: readonly string[]): void {
  if (!roles.includes('SUPER_ADMIN')) throw new ImportForbiddenError();
}
