import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { EmployeeNotFoundError } from '../organization.errors';
import { OrganizationService } from '../organization.service';
import { EmployeeRecord, OrganizationRecord } from '../organization.types';

/**
 * Locks the employee through the facade (`FOR SHARE`: still there, not changed, until commit) and reads it in the same
 * transaction. Only a missing employee becomes null; every other error goes through unchanged (H4.1, F-12).
 */
export async function lockAndReadEmployee(
  organization: OrganizationService,
  tx: DbTx,
  employeeId: string,
): Promise<EmployeeRecord | null> {
  try {
    await organization.lockEmployeeForShare(tx, employeeId);
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) return null;
    throw error;
  }

  return organization.getEmployee(employeeId, tx);
}

/** The installation's organization; the department use cases run only after installation. */
export async function requireOrganization(organization: OrganizationService): Promise<OrganizationRecord> {
  const record = await organization.getOrganization();
  if (!record) throw new Error('Departments were used before installation');

  return record;
}
