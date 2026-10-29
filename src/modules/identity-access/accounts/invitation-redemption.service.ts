import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PasswordPolicyError } from '../public/identity-access.errors';
import { employeeHasNotLeft } from '../policies/account.policy';
import { AccountDirectoryService } from './account-directory.service';
import { InvitationInvalidError } from './account.errors';
import { ActionLinkService } from './action-link.service';
import { CredentialService } from './credential.service';

/**
 * Redeeming an invitation link: the account's first password, and its activation (slice 1b). It takes the AppUser row
 * lock first, then the token, and re-reads what it decides on (lock protocol rules 1 and 2).
 */
@Injectable()
export class InvitationRedemptionService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly links: ActionLinkService,
    private readonly credentials: CredentialService,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Sets the account's first password and activates it. Every reason a link cannot be used gives the same
   * InvitationInvalidError. The password length is checked before the token is looked at, so a weak password reveals
   * nothing about the token.
   */
  async redeemInvitation(token: string, password: string): Promise<void> {
    const lengthViolation = this.credentials.checkPasswordPolicy(password, '');
    if (lengthViolation && lengthViolation !== 'EQUALS_LOGIN_EMAIL') throw new PasswordPolicyError(lengthViolation);

    // Find the token first: a malformed or unknown token costs no Argon2 (R-09). The answer is the same
    // generic error either way, and a 256-bit random token cannot be guessed from the timing.
    if (!this.links.isWellFormedActionToken(token)) throw new InvitationInvalidError();
    const tokenHash = this.links.hashActionToken(token);
    const appUserId = await this.links.findActionTokenOwner(tokenHash);
    if (!appUserId) throw new InvitationInvalidError();

    // Hashing is the slow part and still happens before any lock (lock protocol rule 3).
    const hash = await this.credentials.hash(password);

    const outcome = await this.runner.run<'activated' | 'invalid' | PasswordPolicyError>(async (tx) => {
      // AppUser first, then the token (spec: the order that cannot deadlock with lock/unlock).
      if (!(await this.accounts.lockAppUser(tx, appUserId, 'UPDATE'))) return 'invalid';
      const stored = await this.links.lockActionToken(tx, tokenHash);
      const account = await this.accounts.findAccountRecord(appUserId, tx);
      if (!stored || !account) return 'invalid';

      const now = new Date();
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      const usable =
        stored.appUserId === appUserId &&
        stored.purpose === 'INVITE' &&
        stored.consumedAt === null &&
        stored.revokedAt === null &&
        stored.expiresAt > now &&
        account.status === 'ACTIVE' &&
        account.activationState === 'INVITED' &&
        employeeHasNotLeft(employee);
      if (!usable) return 'invalid';

      const emailViolation = this.credentials.checkPasswordPolicy(password, account.loginEmail);
      if (emailViolation) return new PasswordPolicyError(emailViolation);

      await this.credentials.createCredential(tx, appUserId, hash);
      await this.accounts.markActivated(tx, appUserId, now);
      await this.links.consumeToken(tx, tokenHash, now);
      await this.audit.record(tx, {
        organizationId: account.organizationId,
        actorKind: 'USER',
        actorAppUserId: appUserId,
        actorRoles: [],
        action: 'APP_USER.ACTIVATED',
        resourceType: 'AppUser',
        resourceId: appUserId,
        before: { activationState: 'INVITED' },
        after: { activationState: 'ACTIVATED', emailVerificationSource: 'INVITATION_REDEEMED' },
        correlationId: appUserId,
      });

      return 'activated';
    });

    if (outcome instanceof PasswordPolicyError) throw outcome;
    if (outcome !== 'activated') throw new InvitationInvalidError();
  }
}
