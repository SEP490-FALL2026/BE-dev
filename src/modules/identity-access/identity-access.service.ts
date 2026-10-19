import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../../core/email';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../organization/organization.service';
import { AccountRepo } from './accounts/account.repo';
import { PASSWORD_HASH_POLICY_VERSION, PasswordHasher } from './auth/password-hasher.service';
import { checkPasswordPolicy } from './auth/password.policy';
import { PasswordPolicyError } from './identity-access.errors';
import { BootstrapSuperAdminInput, EmployeeAccountInspection } from './identity-access.types';
import { employeeHasNotLeft, isActionLinkRedeemable } from './policies/account-policy';

/** Public facade of the identity-access module. */
@Injectable()
export class IdentityAccessService {
  constructor(
    private readonly accounts: AccountRepo,
    private readonly hasher: PasswordHasher,
    private readonly organization: OrganizationService,
  ) {}

  /**
   * Checks the password policy and hashes the password. Call this BEFORE opening a transaction:
   * hashing is the slow part and must not hold database locks (lock protocol rule 3).
   */
  async prepareCredential(password: string, loginEmail: string): Promise<{ hash: string; hashPolicyVersion: number }> {
    const violation = checkPasswordPolicy(password, loginEmail);
    if (violation) throw new PasswordPolicyError(violation);

    return { hash: await this.hasher.hash(password), hashPolicyVersion: PASSWORD_HASH_POLICY_VERSION };
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
    await this.accounts.createCredential(tx, user.id, input.passwordHash, input.hashPolicyVersion);
    await this.accounts.grantRole(tx, {
      organizationId: input.organizationId,
      appUserId: user.id,
      role: 'SUPER_ADMIN',
    });

    return { appUserId: user.id };
  }

  /**
   * Whether the link behind this token hash would still work, for an invitation or a password reset;
   * the dispatcher asks this before sending (T-10).
   */
  async isActionLinkUsable(tokenHash: string): Promise<boolean> {
    const link = await this.accounts.findActionLink(tokenHash);
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
  async inspectEmployeeAccount(tx: DbTx, employeeId: string): Promise<EmployeeAccountInspection> {
    const appUserId = await this.accounts.findAccountIdByEmployee(tx, employeeId);
    if (appUserId === null) return { hasAccount: false, usable: false, roles: [] };

    await this.accounts.lockAppUser(tx, appUserId, 'SHARE');
    const account = await this.accounts.readAccount(tx, appUserId);
    const roles = await this.accounts.effectiveRoles(appUserId, tx);

    return {
      hasAccount: account !== null,
      usable: account !== null && account.status === 'ACTIVE' && account.activationState === 'ACTIVATED',
      roles,
    };
  }

  /** Among these employees, those who hold the IT Admin role on a usable account (an unlocked read, for lists). */
  findUsableItAdminEmployeeIds(employeeIds: readonly string[]): Promise<Set<string>> {
    return this.accounts.findUsableItAdminEmployeeIds(employeeIds);
  }
}
