import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * The approval roles an employee holds now, which the successor check of the Super Admin role refuses (US-01-09 AC-3).
 * Approval roles implement this; accounts only names what it needs, so it never imports them.
 */
export interface ApprovalRoleHoldings {
  rolesHeldBy(client: DbTx | undefined, employeeId: string): Promise<string[]>;
}

export const APPROVAL_ROLE_HOLDINGS = Symbol('APPROVAL_ROLE_HOLDINGS');
