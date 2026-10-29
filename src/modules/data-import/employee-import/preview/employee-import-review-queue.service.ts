import type { LicensingApi } from '../../../licensing/public/licensing.api';
import type { OrganizationApi } from '../../../organization/public/organization.api';
import type { EmployeeCells } from '../employee-import-row.types';
import type { ImportSummary } from '../employee-import.types';
import { clean } from '../row-validation/employee-import-row-validation.policy';

/** The people who hold a seat, still work here and are not in the file (`US-02-02` AC-4), by code, at most 200. */
export async function reviewQueueOf(
  licensing: LicensingApi,
  organization: OrganizationApi,
  rows: readonly { cells: EmployeeCells }[],
): Promise<ImportSummary['reviewQueue']> {
  const inFile = new Set(rows.map((row) => clean(row.cells.employee_code)));
  const holders = await licensing.openSeatHolders();
  if (holders.length === 0) return { total: 0, items: [] };
  const seats = new Map(holders.map((holder) => [holder.employeeId, holder.seats]));
  const people = await organization.getEmployees([...seats.keys()]);
  const queue = people
    .filter((person) => person.status === 'ACTIVE' && !inFile.has(person.employeeCode))
    .map((person) => ({
      employeeCode: person.employeeCode,
      fullName: person.fullName,
      seats: seats.get(person.id) ?? 0,
    }))
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  return { total: queue.length, items: queue.slice(0, 200) };
}
