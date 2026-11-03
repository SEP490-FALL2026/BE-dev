import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApprovalRoleChangeListeners } from '../public/identity-access.extension-points';
import { AppRole, RoleGrantRecord } from '../public/identity-access.types';
import { RoleGrantRepo } from './role-grant.repo';

/**
 * The roles granted to accounts (RoleGrant): the one door other capabilities, the recovery command and the use cases
 * of the API use to read and change them. Same queries and transaction clients as the repository behind it.
 */
@Injectable()
export class RoleGrantService {
  constructor(
    private readonly grants: RoleGrantRepo,
    private readonly roleChanges: ApprovalRoleChangeListeners,
  ) {}

  effectiveRoles(appUserId: string, tx?: DbTx): Promise<AppRole[]> {
    return this.grants.effectiveRoles(appUserId, tx);
  }

  effectiveRolesFor(appUserIds: string[]): Promise<Map<string, AppRole[]>> {
    return this.grants.effectiveRolesFor(appUserIds);
  }

  grantHistory(appUserId: string, limit: number): Promise<RoleGrantRecord[]> {
    return this.grants.grantHistory(appUserId, limit);
  }

  /** Granting FINANCE or SPENDING_APPROVER tells the modules that act on who holds a step (`FR-3.16`), in this transaction. */
  async grantRole(
    tx: DbTx,
    input: { organizationId: string; appUserId: string; role: AppRole; grantedBy?: string },
  ): Promise<{ id: string }> {
    const granted = await this.grants.grantRole(tx, input);
    if (input.role === 'FINANCE' || input.role === 'SPENDING_APPROVER') {
      await this.roleChanges.emit(tx, {
        role: input.role,
        fromEmployeeId: null,
        toEmployeeId: await this.grants.employeeOf(tx, input.appUserId),
        id: randomUUID(),
      });
    }

    return granted;
  }

  /** Whether this call revoked the grant (false when the role was not held). Revoking FINANCE is announced like granting it. */
  async revokeRole(
    tx: DbTx,
    input: { appUserId: string; role: AppRole; revokedBy: string; now: Date },
  ): Promise<boolean> {
    const revoked = await this.grants.revokeRole(tx, input);
    if (revoked && (input.role === 'FINANCE' || input.role === 'SPENDING_APPROVER')) {
      await this.roleChanges.emit(tx, {
        role: input.role,
        fromEmployeeId: await this.grants.employeeOf(tx, input.appUserId),
        toEmployeeId: null,
        id: randomUUID(),
      });
    }

    return revoked;
  }

  /** Serializes every change to the approval roles and to the grant of SPENDING_APPROVER; taken before the account lock (lock order). */
  lockApprovalRolesForChange(tx: DbTx): Promise<void> {
    return this.grants.lockApprovalRolesForChange(tx);
  }

  /** True when any account in the organization holds an effective SPENDING_APPROVER grant, whatever its state (QĐ-93a). */
  spendingApproverIsHeld(tx: DbTx, organizationId: string): Promise<boolean> {
    return this.grants.spendingApproverIsHeld(tx, organizationId);
  }

  /** The employee who is the spending approver (the effective grant, whatever the state of the account); null when nobody is. */
  spendingApproverEmployeeId(client?: DbTx, options?: { forShare?: boolean }): Promise<string | null> {
    return this.grants.spendingApproverEmployeeId(client, options);
  }

  /** True when any account in the organization holds an effective FINANCE grant, whatever its state (QĐ-67e). */
  financeIsHeld(tx: DbTx, organizationId: string): Promise<boolean> {
    return this.grants.financeIsHeld(tx, organizationId);
  }

  /** The account that holds the effective SUPER_ADMIN grant, whatever its state; null when nobody does. */
  findSuperAdminHolderId(tx: DbTx): Promise<string | null> {
    return this.grants.findSuperAdminHolderId(tx);
  }

  /** Which of the roles each of these employees holds, whatever the state of the account (one read). */
  listHoldersAmong(
    employeeIds: readonly string[],
    roles: readonly AppRole[],
    tx?: DbTx,
  ): Promise<Map<string, AppRole[]>> {
    return this.grants.listHoldersAmong(employeeIds, roles, tx);
  }

  /** How many effective grants each role has (roles with none are absent). */
  countEffectiveGrantsByRole(tx: DbTx): Promise<Map<AppRole, number>> {
    return this.grants.countEffectiveByRole(tx);
  }
}
