import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../../../core/email';
import { TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { CredentialService } from '../credentials/credential.service';
import { PasswordPolicyError } from '../public/identity-access.errors';
import { AccountNoLongerUsableError, CurrentPasswordInvalidError } from './auth.errors';
import { CredentialChangeService } from './credential-change.service';
import { LoginThrottle } from './login-throttle.service';
import { canReceiveResetMail } from './password-reset.policy';

/** Changing one's own password while signed in (`US-01-10` AC-5). */
@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly organization: OrganizationApi,
    private readonly changes: CredentialChangeService,
    private readonly throttle: LoginThrottle,
    private readonly credentials: CredentialService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws LoginTemporarilyBlockedError while the email is blocked, CurrentPasswordInvalidError for a wrong
   * current password (counted like a wrong sign-in, never locking the account), PasswordPolicyError for a
   * new password that breaks the policy, AccountNoLongerUsableError if the account stopped being usable
   * meanwhile, or TransientDatabaseError when the database fails.
   */
  async changePassword(principal: AuthenticatedPrincipal, currentPassword: string, newPassword: string): Promise<void> {
    try {
      await this.performChange(principal, currentPassword, newPassword);
    } catch (error) {
      throw toTransientError(error) ?? error;
    }
  }

  private async performChange(
    principal: AuthenticatedPrincipal,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const account = await this.accounts.findAccountById(principal.appUserId);
    // The guard just resolved this account; losing it now is a state change, answered as the guard would.
    if (!account) throw new AccountNoLongerUsableError();
    const keyHash = this.throttle.keyFor(normalizeEmail(account.loginEmail));
    await this.throttle.assertNotBlocked(account.organizationId, keyHash);

    // Everything CPU-heavy happens before the transaction (lock protocol rule 3).
    const verifiedHash = await this.verifyCurrent(account.credentialHash, currentPassword);
    if (verifiedHash === null) {
      // Only a wrong attempt is a failure; it joins the sign-in counter, in one atomic statement.
      await this.throttle.recordFailure(account.organizationId, keyHash);
      throw new CurrentPasswordInvalidError();
    }
    const violation = this.credentials.checkPasswordPolicy(newPassword, account.loginEmail);
    if (violation) throw new PasswordPolicyError(violation);
    const hash = await this.credentials.hash(newPassword);

    await this.runner.run(async (tx) => {
      if (!(await this.accounts.lockAppUser(tx, account.id, 'UPDATE'))) throw new AccountNoLongerUsableError();
      const current = await this.accounts.readAccount(tx, account.id);
      const employee = current ? await this.organization.getEmployee(current.employeeId, tx) : null;
      if (!current || !employee || !canReceiveResetMail(current, employee)) throw new AccountNoLongerUsableError();
      // Another change or reset won the lock first: what was verified is no longer the current password.
      if (current.credentialHash !== verifiedHash) throw new CurrentPasswordInvalidError();

      await this.changes.replace(tx, {
        account: current,
        hash,
        event: 'PASSWORD_CHANGED',
        fullName: employee.fullName,
        actor: {
          actorKind: 'USER',
          actorAppUserId: principal.appUserId,
          actorRoles: principal.roles,
          correlationId: principal.sessionId,
        },
        now: new Date(),
      });
    });
  }

  /** The stored hash when `password` matches it, otherwise null. Burns equal CPU when there is no credential. */
  private async verifyCurrent(storedHash: string | null, password: string): Promise<string | null> {
    if (!storedHash) {
      await this.credentials.verifyAgainstDummy(password);
      return null;
    }

    return (await this.credentials.verify(storedHash, password)) ? storedHash : null;
  }
}
