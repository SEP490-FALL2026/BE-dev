import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { normalizeEmail } from '../../../core/email';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { ActionLinkService } from '../accounts/action-link.service';
import { CredentialService } from '../credentials/credential.service';
import { RoleGrantService } from '../accounts/role-grant.service';
import { ApprovalRoleHoldersService } from '../approval-roles/approval-role-holders.service';
import {
  ApprovalRoleHolders,
  BootstrapSuperAdminInput,
  EmployeeAccountInspection,
  LeaverGrantRole,
  SuperAdminHolder,
} from './identity-access.types';
import { employeeHasNotLeft, isActionLinkRedeemable } from '../accounts/account.policy';

/** Public facade of the identity-access module. */
@Injectable()
export class IdentityAccessApi {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly links: ActionLinkService,
    private readonly credentials: CredentialService,
    private readonly organization: OrganizationApi,
    private readonly approvalRoles: ApprovalRoleHoldersService,
  ) {}

  /**
   * Checks the password policy and hashes the password. Call this BEFORE opening a transaction:
   * hashing is the slow part and must not hold database locks (lock protocol rule 3).
   */
  prepareCredential(password: string, loginEmail: string): Promise<{ hash: string; hashPolicyVersion: number }> {
    return this.credentials.prepareCredential(password, loginEmail);
  }

  /**
   * Installation only (FR-9.8): an activated account for `employeeId` holding the one SUPER_ADMIN
   * grant. The email counts as asserted by the person running the command, not as verified by
   * an invitation, and is recorded that way.
   */
  async createBootstrapSuperAdmin(tx: DbTx, input: BootstrapSuperAdminInput): Promise<{ appUserId: string }> {
    const user = await this.accounts.createAppUser(tx, {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      loginEmail: input.loginEmail.trim(),
      normalizedLoginEmail: normalizeEmail(input.loginEmail),
      status: 'ACTIVE',
      activationState: 'ACTIVATED',
      emailVerificationSource: 'BOOTSTRAP_ASSERTED',
      emailVerifiedAt: new Date(),
    });
    await this.credentials.createCredential(tx, user.id, input.passwordHash, input.hashPolicyVersion);
    await this.grants.grantRole(tx, {
      organizationId: input.organizationId,
      appUserId: user.id,
      role: 'SUPER_ADMIN',
    });

    return { appUserId: user.id };
  }

  /**
   * Whether the link behind this token hash would still work, for an invitation or a password reset;
   * the dispatcher asks this before sending.
   */
  async isActionLinkUsable(tokenHash: string): Promise<boolean> {
    const link = await this.links.findActionLink(tokenHash);
    if (link === null || !isActionLinkRedeemable(link, new Date())) return false;

    // Redeeming refuses an employee who has left, so a link to one is dead and must not be mailed.
    return employeeHasNotLeft(await this.organization.getEmployee(link.appUser.employeeId));
  }

  /**
   * The account of an employee as another module needs to judge it: does it exist, can it sign in, which roles it
   * holds. Takes the account's row lock `FOR SHARE` first (lock protocol: the employee, then the account) and reads
   * in a statement of its own, so a grant or a lock that commits after this cannot change what was judged before
   * commit.
   */
  inspectEmployeeAccount(tx: DbTx, employeeId: string): Promise<EmployeeAccountInspection> {
    return this.accounts.inspectEmployeeAccount(tx, employeeId);
  }

  /**
   * The person behind the account of this employee left on `leftOn` (the record of a departure calls it once, in its transaction): the
   * Super Admin then lists such accounts and locks them with a reason. The sign-in and the guard refuse the person from the status of
   * the employee, not from this day. Nothing when the employee has no account.
   */
  markEmployeeLeft(tx: DbTx, employeeId: string, leftOn: BusinessDate): Promise<void> {
    return this.accounts.markEmployeeLeft(tx, employeeId, leftOn);
  }

  /** Among these employees, those who hold the IT Admin role on a usable account (an unlocked read, for lists). */
  findUsableItAdminEmployeeIds(employeeIds: readonly string[]): Promise<Set<string>> {
    return this.accounts.findUsableItAdminEmployeeIds(employeeIds);
  }

  /** The usable IT Admin with the smallest employee code, or null: who a report is given to when nobody is in charge. */
  findFirstUsableItAdminEmployeeId(tx?: DbTx): Promise<string | null> {
    return this.accounts.findFirstUsableItAdminEmployeeId(tx);
  }

  /** The employee who holds the FINANCE role on an account that can act now, or null: who a review of Finance is given to. */
  findUsableFinanceEmployeeId(tx?: DbTx): Promise<string | null> {
    return this.accounts.findUsableFinanceEmployeeId(tx);
  }

  /** The employee who holds the SUPER_ADMIN role on an account that can act, or null: who is told to configure a role (an unlocked read). */
  findUsableSuperAdminEmployeeId(tx?: DbTx): Promise<string | null> {
    return this.accounts.findUsableSuperAdminEmployeeId(tx);
  }

  /**
   * The account of this employee, or null when they have none: what a flow that carries out a decision a person took earlier needs, to
   * act in their name (a transfer review that revokes a seat when the new Request ends, `STILL_NEEDED`) (an unlocked read).
   */
  findAccountIdOfEmployee(tx: DbTx, employeeId: string): Promise<string | null> {
    return this.accounts.findAccountIdByEmployee(tx, employeeId);
  }

  /** The login email of the account of this employee, or null when they have none (an unlocked read): what a command compares a reference with. */
  async findLoginEmailOfEmployee(tx: DbTx, employeeId: string): Promise<string | null> {
    const appUserId = await this.accounts.findAccountIdByEmployee(tx, employeeId);

    return appUserId === null ? null : this.accounts.findLoginEmail(appUserId);
  }

  /** The employee behind each of these accounts, by account id; for a consumer that reads who acted from an audit event (an unlocked read). */
  employeeIdsOfAccounts(appUserIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    return this.accounts.employeeIdsOfAccounts(appUserIds, tx);
  }

  /** How many IT Admins other than this employee can act (an unlocked read, `QĐ-77m`); with `tx`, in the transaction of the act. */
  countUsableItAdminsExcept(employeeId: string, tx?: DbTx): Promise<number> {
    return this.accounts.countUsableItAdminsExcept(employeeId, tx);
  }

  /**
   * Who holds the spending approver, the substitute for a conflict of interest and the fallback approver now (an unlocked
   * read): what the routing of a request needs to name the person who holds a step. A role nobody holds is null.
   */
  getApprovalRoleHolders(tx?: DbTx): Promise<ApprovalRoleHolders> {
    return this.approvalRoles.current(tx);
  }

  /** The one account that holds the Super Admin role and what decides whether it can act; null when nobody holds it (an unlocked read). */
  getSuperAdminHolder(tx?: DbTx): Promise<SuperAdminHolder | null> {
    return this.accounts.findSuperAdminHolder(tx);
  }

  /** Which of the Super Admin and Finance roles each of these employees holds, whatever the state of the account (one unlocked read). */
  async listRoleHoldersAmong(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, LeaverGrantRole[]>> {
    const held = await this.grants.listHoldersAmong(employeeIds, ['SUPER_ADMIN', 'FINANCE'], tx);

    return new Map([...held].map(([employeeId, roles]) => [employeeId, roles as LeaverGrantRole[]]));
  }
}
