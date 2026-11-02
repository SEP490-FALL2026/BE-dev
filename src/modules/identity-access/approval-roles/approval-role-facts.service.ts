import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApprovalRoleHoldings } from '../accounts/account.types';
import { RoleGrantService } from '../accounts/role-grant.service';

/**
 * Who holds an approval role now, for the capabilities that only need to know it: the successor check of the role transfer
 * (US-01-09 AC-3) and the inspection of an installation. The one approval role left is SPENDING_APPROVER, a role grant (`QĐ-93b`);
 * the substitute and the fallback approver are gone (`QĐ-93c`), so this reads the grant and nothing else.
 */
@Injectable()
export class ApprovalRoleFactsService implements ApprovalRoleHoldings {
  constructor(private readonly grants: RoleGrantService) {}

  /** The approval roles somebody holds now, one entry per current holder (no employee leaves this method). */
  async heldRoles(client: DbTx): Promise<'SPENDING_APPROVER'[]> {
    return (await this.grants.spendingApproverEmployeeId(client)) === null ? [] : ['SPENDING_APPROVER'];
  }

  /** The approval roles the employee holds now (for the checks that must refuse a Super Admin who holds one). */
  async rolesHeldBy(client: DbTx | undefined, employeeId: string): Promise<'SPENDING_APPROVER'[]> {
    return (await this.grants.spendingApproverEmployeeId(client)) === employeeId ? ['SPENDING_APPROVER'] : [];
  }
}
