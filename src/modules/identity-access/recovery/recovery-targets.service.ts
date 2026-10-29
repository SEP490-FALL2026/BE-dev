import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../organization/public/organization.api';
import { EmployeeRecord, OrganizationRecord } from '../../organization/public/organization.types';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { RoleGrantService } from '../accounts/role-grant.service';
import { AccountSnapshot } from '../public/identity-access.types';
import { tryNormalize } from './recovery-procedure.policy';
import { RecoveryRefusedError } from '../public/recovery.errors';

/**
 * The accounts a recovery acts on: found by email before any lock, then locked in the order of the lock protocol
 * (employees, then accounts by id) and read again under those locks, in statements of their own.
 */
@Injectable()
export class RecoveryTargets {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly organization: OrganizationApi,
  ) {}

  async requireOrganization(): Promise<OrganizationRecord> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A recovery was run before installation');

    return organization;
  }

  async locateByEmail(organizationId: string, email: string): Promise<AccountSnapshot> {
    const normalized = tryNormalize(email);
    const found = normalized === null ? null : await this.accounts.findAccountByLoginEmail(organizationId, normalized);
    if (!found) throw new RecoveryRefusedError('TARGET_NOT_FOUND');

    return found;
  }

  /**
   * Locks the holder found by email (the employee for share, then the account for update) and reads it again: refused
   * when the account is gone or no longer holds the Super Admin role. The employee is read last, as it is now.
   */
  async lockHolder(
    tx: DbTx,
    located: AccountSnapshot,
  ): Promise<{ account: AccountSnapshot; employee: EmployeeRecord | null }> {
    await this.organization.lockEmployeeForShare(tx, located.employeeId);
    await this.accounts.lockAppUser(tx, located.id, 'UPDATE');
    const account = await this.accounts.readAccount(tx, located.id);
    if (!account) throw new RecoveryRefusedError('TARGET_NOT_FOUND');
    if (!(await this.grants.effectiveRoles(account.id, tx)).includes('SUPER_ADMIN')) {
      throw new RecoveryRefusedError('TARGET_NOT_HOLDER');
    }

    return { account, employee: await this.organization.getEmployee(account.employeeId, tx) };
  }

  /** Whether another account already signs in with this address. An unlocked read, like the one before AC-10. */
  async isLoginEmailTakenByOther(organizationId: string, normalized: string, appUserId: string): Promise<boolean> {
    const other = await this.accounts.findAccountByLoginEmail(organizationId, normalized);

    return other !== null && other.id !== appUserId;
  }

  /** Opens a locked account again (AC-14). The caller holds its lock. */
  reopen(tx: DbTx, appUserId: string): Promise<void> {
    return this.accounts.setStatus(tx, appUserId, 'ACTIVE');
  }

  /**
   * Locks everything a role transfer acts on, in protocol order: the employees (by id), then the accounts (by id).
   * Returns the successor's account, or null when they have none yet.
   */
  async lockForTransfer(tx: DbTx, successorEmployeeId: string, holder: AccountSnapshot | null): Promise<string | null> {
    const employeeIds = [...new Set([successorEmployeeId, ...(holder ? [holder.employeeId] : [])])].sort();
    for (const employeeId of employeeIds) await this.organization.lockEmployeeForShare(tx, employeeId);
    const successorAccountId = await this.accounts.findAccountIdByEmployee(tx, successorEmployeeId);
    const accountIds = [
      ...new Set([...(holder ? [holder.id] : []), ...(successorAccountId ? [successorAccountId] : [])]),
    ].sort();
    for (const accountId of accountIds) await this.accounts.lockAppUser(tx, accountId, 'UPDATE');

    return successorAccountId;
  }

  /**
   * The account that holds the Super Admin role now, which must be the one the ticket names (or nobody), with its
   * employee: refused with TARGET_NOT_HOLDER before anything else is read.
   */
  async readHolder(
    tx: DbTx,
    expectedHolderId: string | null,
  ): Promise<{ holderId: string | null; account: AccountSnapshot | null; employee: EmployeeRecord | null }> {
    const holderId = await this.grants.findSuperAdminHolderId(tx);
    if (holderId !== expectedHolderId) throw new RecoveryRefusedError('TARGET_NOT_HOLDER');
    const account = holderId ? await this.accounts.readAccount(tx, holderId) : null;
    const employee = account ? await this.organization.getEmployee(account.employeeId, tx) : null;

    return { holderId, account, employee };
  }
}
