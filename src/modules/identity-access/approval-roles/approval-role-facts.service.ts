import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApprovalRoleHoldings } from '../accounts/account.types';
import { RoleGrantService } from '../accounts/role-grant.service';
import { ApprovalRoleName, ApprovalRoleRepo } from './approval-role.repo';

/**
 * Who holds an approval role now, for the capabilities that only need to know it: the per-request role check
 * (`SPENDING_APPROVER` is a granted role, QĐ-93a), the grant of that role (the substitute is never the spending approver) and the
 * successor check of the role transfer (US-01-09 AC-3). The spending approver is read from the role grant, the other two from the
 * approval-role table.
 */
@Injectable()
export class ApprovalRoleFactsService implements ApprovalRoleHoldings {
  constructor(
    private readonly holders: ApprovalRoleRepo,
    private readonly grants: RoleGrantService,
  ) {}

  /** Whether the employee is the current spending approver. An unlocked read, for the per-request role check. */
  async isSpendingApprover(employeeId: string): Promise<boolean> {
    return (await this.grants.spendingApproverEmployeeId()) === employeeId;
  }

  /** The approval roles somebody holds now, one entry per current holder (no employee leaves this method). */
  async heldRoles(client: DbTx): Promise<(ApprovalRoleName | 'SPENDING_APPROVER')[]> {
    const held: (ApprovalRoleName | 'SPENDING_APPROVER')[] = (await this.holders.currentHolders(client)).map(
      (holder) => holder.role,
    );
    if ((await this.grants.spendingApproverEmployeeId(client)) !== null) held.unshift('SPENDING_APPROVER');

    return held;
  }

  /** The approval roles the employee holds now (for the checks that must refuse a Super Admin who holds one). */
  async rolesHeldBy(client: DbTx | undefined, employeeId: string): Promise<(ApprovalRoleName | 'SPENDING_APPROVER')[]> {
    const roles: (ApprovalRoleName | 'SPENDING_APPROVER')[] = await this.holders.rolesHeldBy(client, employeeId);
    if ((await this.grants.spendingApproverEmployeeId(client)) === employeeId) roles.unshift('SPENDING_APPROVER');

    return roles;
  }
}
