import { Injectable } from '@nestjs/common';
import { TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { ActionLinkService } from '../accounts/action-link.service';
import { CredentialService } from '../accounts/credential.service';
import { PasswordPolicyError } from '../identity-access.errors';
import { PasswordResetInvalidError } from './auth.errors';
import { PasswordResetRedemptionService } from './password-reset-redemption.service';
import { canReceiveResetMail } from './password-reset.policy';

/**
 * Resetting a password with a reset link (slice 1c). It takes the AppUser row lock first, then the token, and re-reads
 * what it decides on (lock protocol rules 1 and 2). Asking for the link is `PasswordResetRequestService`.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly links: ActionLinkService,
    private readonly credentials: CredentialService,
    private readonly organization: OrganizationService,
    private readonly redemption: PasswordResetRedemptionService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Sets a new password from a reset link. Throws PasswordPolicyError for a password that breaks the
   * policy (checked before the link, so it reveals nothing about it), PasswordResetInvalidError for
   * every reason a link cannot be used, or TransientDatabaseError when the database fails.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      await this.performReset(token, newPassword);
    } catch (error) {
      throw toTransientError(error) ?? error;
    }
  }

  private async performReset(token: string, newPassword: string): Promise<void> {
    // The length rules only: the email rule needs the account, which needs the token. A weak password is
    // refused before the token is looked at, so the answer reveals nothing about the link.
    const lengthViolation = this.credentials.checkPasswordPolicy(newPassword, '');
    if (lengthViolation && lengthViolation !== 'EQUALS_LOGIN_EMAIL') throw new PasswordPolicyError(lengthViolation);

    // A malformed or unknown token costs no Argon2 (R-09): the answer is the same generic error either way.
    if (!this.links.isWellFormedActionToken(token)) throw new PasswordResetInvalidError();
    const tokenHash = this.links.hashActionToken(token);
    const header = await this.links.findActionTokenHeader(tokenHash);
    // Not a reset link, or one already spent, revoked or expired: refused now, before any Argon2 is spent on it.
    if (
      !header ||
      header.purpose !== 'RESET_PASSWORD' ||
      header.consumedAt !== null ||
      header.revokedAt !== null ||
      header.expiresAt <= new Date()
    ) {
      throw new PasswordResetInvalidError();
    }
    const appUserId = header.appUserId;

    // Hashing is the slow part and still happens before any lock (lock protocol rule 3).
    const hash = await this.credentials.hash(newPassword);

    const outcome = await this.runner.run<'reset' | 'invalid' | PasswordPolicyError>(async (tx) => {
      // AppUser first, then the token (the order that cannot deadlock with lock/unlock and invitations).
      if (!(await this.accounts.lockAppUser(tx, appUserId, 'UPDATE'))) return 'invalid';
      const stored = await this.links.lockActionToken(tx, tokenHash);
      const account = await this.accounts.readAccount(tx, appUserId);
      if (!stored || !account) return 'invalid';

      const now = new Date();
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      const usable =
        stored.appUserId === appUserId &&
        stored.purpose === 'RESET_PASSWORD' &&
        stored.consumedAt === null &&
        stored.revokedAt === null &&
        stored.expiresAt > now &&
        canReceiveResetMail(account, employee);
      if (!usable || !employee) return 'invalid';

      const emailViolation = this.credentials.checkPasswordPolicy(newPassword, account.loginEmail);
      if (emailViolation) return new PasswordPolicyError(emailViolation);

      return this.redemption.redeem(tx, { account, employee, stored, tokenHash, hash, now });
    });

    if (outcome instanceof PasswordPolicyError) throw outcome;
    if (outcome !== 'reset') throw new PasswordResetInvalidError();
  }
}
