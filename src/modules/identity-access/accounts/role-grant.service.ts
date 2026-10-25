import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApprovalRoleChangeRegistry } from '../approval-roles/approval-role-change.registry';
import { AppRole, RoleGrantRecord } from '../identity-access.types';
import { RoleGrantRepo } from './role-grant.repo';

/**
 * The roles granted to accounts (RoleGrant): the one door other capabilities, the recovery command and the use cases
 * of the API use to read and change them. Same queries and transaction clients as the repository behind it.
 */
@Injectable()
export class RoleGrantService {
  constructor(
    private readonly grants: RoleGrantRepo,
    private readonly roleChanges: ApprovalRoleChangeRegistry,
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

  /** Granting FINANCE tells the modules that act on who holds a step (`FR-3.16`), in this transaction. */
  async grantRole(
    tx: DbTx,
    input: { organizationId: string; appUserId: string; role: AppRole; grantedBy?: string },
  ): Promise<{ id: string }> {
    const granted = await this.grants.grantRole(tx, input);
    if (input.role === 'FINANCE') {
      await this.roleChanges.announce(tx, {
        role: 'FINANCE',
        fromEmployeeId: null,
        toEmployeeId: await this.grants.employeeOf(tx, input.appUserId),
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
    if (revoked && input.role === 'FINANCE') {
      await this.roleChanges.announce(tx, {
        role: 'FINANCE',
        fromEmployeeId: await this.grants.employeeOf(tx, input.appUserId),
        toEmployeeId: null,
      });
    }

    return revoked;
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
