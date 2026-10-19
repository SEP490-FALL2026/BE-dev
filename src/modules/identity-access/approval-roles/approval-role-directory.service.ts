import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApprovalRoleHoldings } from '../accounts/account.types';
import { ApprovalRoleName, ApprovalRoleRepo } from './approval-role.repo';

/**
 * Who holds an approval role now, for the capabilities that only need to know it: the per-request role check
 * (`SPENDING_APPROVER` is a derived role) and the successor check of the Super Admin transfer (US-01-09 AC-3).
 */
@Injectable()
export class ApprovalRoleDirectoryService implements ApprovalRoleHoldings {
  constructor(private readonly holders: ApprovalRoleRepo) {}

  /** Whether the employee is the current spending approver. An unlocked read, for the per-request role check. */
  isSpendingApprover(employeeId: string): Promise<boolean> {
    return this.holders.isSpendingApprover(employeeId);
  }

  /** The approval roles somebody holds now, one entry per current holder (no employee leaves this method). */
  async heldRoles(client: DbTx): Promise<ApprovalRoleName[]> {
    return (await this.holders.currentHolders(client)).map((holder) => holder.role);
  }

  /** The approval roles the employee holds now (for the checks that must refuse a Super Admin who holds one). */
  rolesHeldBy(client: DbTx | undefined, employeeId: string): Promise<ApprovalRoleName[]> {
    return this.holders.rolesHeldBy(client, employeeId);
  }
}
