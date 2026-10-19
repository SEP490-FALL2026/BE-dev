import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AppRole, RoleGrantRecord } from '../identity-access.types';
import { RoleGrantRepo } from './role-grant.repo';

/**
 * The roles granted to accounts (RoleGrant): the one door other capabilities, the recovery command and the use cases
 * of the API use to read and change them. Same queries and transaction clients as the repository behind it.
 */
@Injectable()
export class RoleGrantService {
  constructor(private readonly grants: RoleGrantRepo) {}

  effectiveRoles(appUserId: string, tx?: DbTx): Promise<AppRole[]> {
    return this.grants.effectiveRoles(appUserId, tx);
  }

  effectiveRolesFor(appUserIds: string[]): Promise<Map<string, AppRole[]>> {
    return this.grants.effectiveRolesFor(appUserIds);
  }

  grantHistory(appUserId: string): Promise<RoleGrantRecord[]> {
    return this.grants.grantHistory(appUserId);
  }

  grantRole(
    tx: DbTx,
    input: { organizationId: string; appUserId: string; role: AppRole; grantedBy?: string },
  ): Promise<{ id: string }> {
    return this.grants.grantRole(tx, input);
  }

  /** Whether this call revoked the grant (false when the role was not held). */
  revokeRole(tx: DbTx, input: { appUserId: string; role: AppRole; revokedBy: string; now: Date }): Promise<boolean> {
    return this.grants.revokeRole(tx, input);
  }

  /** True when any account in the organization holds an effective FINANCE grant, whatever its state (QĐ-67e). */
  financeIsHeld(tx: DbTx, organizationId: string): Promise<boolean> {
    return this.grants.financeIsHeld(tx, organizationId);
  }

  /** The account that holds the effective SUPER_ADMIN grant, whatever its state; null when nobody does. */
  findSuperAdminHolderId(tx: DbTx): Promise<string | null> {
    return this.grants.findSuperAdminHolderId(tx);
  }
}
