import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { EmployeeRecord, OrganizationRecord } from '../public/organization.types';

/**
 * Locks the employee through the facade (`FOR SHARE`: still there, not changed, until commit; `FOR UPDATE` when the caller counts
 * something over the employee and must be the only one counting) and reads it in the same transaction. Only a missing employee
 * becomes null; every other error goes through unchanged.
 */
export async function lockAndReadEmployee(
  employees: EmployeeRecordService,
  tx: DbTx,
  employeeId: string,
  mode: 'SHARE' | 'UPDATE' = 'SHARE',
): Promise<EmployeeRecord | null> {
  try {
    await employees.lock(tx, employeeId, mode);
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) return null;
    throw error;
  }

  return employees.find(employeeId, tx);
}

/** The installation's organization; the department use cases run only after installation. */
export async function requireOrganization(context: OrganizationContextService): Promise<OrganizationRecord> {
  const record = await context.findOrganization();
  if (!record) throw new Error('Departments were used before installation');

  return record;
}
