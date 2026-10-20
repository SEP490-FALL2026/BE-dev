import { Injectable } from '@nestjs/common';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { AccountDirectoryService } from './accounts/account-directory.service';
import { RoleGrantService } from './accounts/role-grant.service';
import { ApprovalRoleDirectoryService } from './approval-roles/approval-role-directory.service';
import { AccountInventory, AccountStateKey, AppRole, ApprovalRoleKind } from './identity-access.types';

const ACCOUNT_STATES: readonly AccountStateKey[] = [
  'ACTIVE_ACTIVATED',
  'ACTIVE_INVITED',
  'LOCKED_ACTIVATED',
  'LOCKED_INVITED',
];
const DIRECT_ROLES: readonly AppRole[] = ['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE'];
const APPROVAL_ROLES: readonly ApprovalRoleKind[] = ['SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER'];

const zeroes = <K extends string>(keys: readonly K[]): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

/**
 * The read-only contract of the installation inspection (`ops:inspect`, H6.1). Declared only in
 * IdentityAccessInspectionFacadeModule, which nothing but the inspection graph loads. Counts and one account state;
 * every read runs in the caller's (read-only) transaction.
 */
@Injectable()
export class IdentityAccessInspectionService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly approvalRoles: ApprovalRoleDirectoryService,
  ) {}

  async accountInventory(tx: DbTx): Promise<AccountInventory> {
    const holderId = await this.grants.findSuperAdminHolderId(tx);
    const holder = holderId === null ? null : await this.accounts.findAccountRecord(holderId, tx);
    const accountsByState = zeroes(ACCOUNT_STATES);
    for (const group of await this.accounts.countAccountsByState(tx))
      accountsByState[`${group.status}_${group.activationState}`] = group.count;
    const directRoles = zeroes(DIRECT_ROLES);
    for (const [role, count] of await this.grants.countEffectiveGrantsByRole(tx)) directRoles[role] = count;
    const approvalRoles = zeroes(APPROVAL_ROLES);
    for (const role of await this.approvalRoles.heldRoles(tx)) approvalRoles[role] += 1;

    return {
      superAdmin:
        holder === null
          ? null
          : {
              holders: directRoles.SUPER_ADMIN,
              status: holder.status,
              activationState: holder.activationState,
              loginEmail: holder.loginEmail,
            },
      accountsByState,
      directRoles,
      approvalRoles,
    };
  }

  /** Among these employees, those who hold the IT Admin role on a usable account, in the caller's transaction. */
  usableItAdminEmployeeIds(employeeIds: readonly string[], tx: DbTx): Promise<Set<string>> {
    return this.accounts.findUsableItAdminEmployeeIds(employeeIds, tx);
  }
}
