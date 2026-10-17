import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { DbTx, TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { OrganizationService } from '../../organization/organization.service';
import { canReceiveResetMail } from '../accounts/account-policy';
import { AccountRepo } from '../accounts/account.repo';
import { PasswordResetInvalidError } from '../errors/identity-access.errors';
import { PasswordPolicyError } from '../identity-access.errors';
import { ActionTokenSnapshot } from '../identity-access.types';
import { RecoveryRepo } from '../recovery.repo';
import { CredentialChangeService } from './credential-change.service';
import { PasswordHasher } from './password-hasher.service';
import { checkPasswordPolicy } from './password.policy';
import { TokenService } from './token.service';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Forgot, then reset, a password (slice 1c). Every method that changes an account takes the AppUser row
 * lock first and re-reads what it decides on (lock protocol rules 1 and 2).
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly accounts: AccountRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly credentials: CredentialChangeService,
    private readonly recoveries: RecoveryRepo,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly runner: TransactionRunner,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Issues a reset link when, and only when, the email belongs to an account that may use one. It
   * returns the same (nothing) for every other case, so the caller learns nothing about which emails
   * exist (AC-3). Only a database failure surfaces, as TransientDatabaseError.
   */
  async requestReset(email: string): Promise<void> {
    try {
      await this.performRequest(email);
    } catch (error) {
      throw toTransientError(error) ?? error;
    }
  }

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

  private async performRequest(email: string): Promise<void> {
    const normalized = this.tryNormalize(email);
    if (normalized === null) return;
    const organization = await this.organization.getOrganization();
    if (!organization) return;
    // Unlocked: decides whether there is anyone to issue a link to. Everything that matters is re-read under the lock.
    const found = await this.accounts.findAccountByLoginEmail(organization.id, normalized);
    if (!found) {
      // The same two reads an existing address costs, so "nobody here" is not faster than "here but refused".
      await this.organization.getEmployee(randomUUID());
      return;
    }
    // An account that cannot use a link (invited, locked, employee left) leaves here without opening a transaction,
    // so only an address that gets a link takes longer than the rest (spec Q-6).
    if (!canReceiveResetMail(found, await this.organization.getEmployee(found.employeeId))) return;

    await this.runner.run(async (tx) => {
      if (!(await this.accounts.lockAppUser(tx, found.id, 'UPDATE'))) return;
      const account = await this.accounts.readAccount(tx, found.id);
      const employee = account ? await this.organization.getEmployee(account.employeeId, tx) : null;
      if (!account || !canReceiveResetMail(account, employee) || !employee) return;

      const now = new Date();
      const issuedLastHour = await this.accounts.countTokensSince(
        tx,
        account.id,
        'RESET_PASSWORD',
        new Date(now.getTime() - ONE_HOUR_MS),
      );
      if (issuedLastHour >= this.config.get('AUTH_PASSWORD_RESET_MAX_PER_HOUR', { infer: true })) return;

      // At most one link works at a time: the older one is revoked and its mail, if not yet sent, cancelled (T-4).
      const previous = (await this.accounts.findUsableTokens(tx, account.id, 'RESET_PASSWORD')).map(
        (token) => token.tokenHash,
      );
      await this.accounts.revokeTokens(tx, previous, 'SUPERSEDED', now);
      await this.notifications.cancelPendingForTokens(tx, previous);

      const issued = this.tokens.newPasswordResetToken(now);
      await this.accounts.insertActionToken(tx, {
        tokenHash: issued.hash,
        appUserId: account.id,
        purpose: 'RESET_PASSWORD',
        expiresAt: issued.expiresAt,
        createdBy: null,
      });
      // To the email stored on the account, never to the one the caller typed.
      await this.notifications.enqueueEmail(tx, {
        organizationId: account.organizationId,
        recipient: account.loginEmail,
        template: 'PASSWORD_RESET',
        locale: 'vi',
        actionTokenHash: issued.hash,
        payload: { token: issued.token, expiresAt: issued.expiresAt.toISOString(), fullName: employee.fullName },
      });
      // Anyone may ask for a link for any email, so the requester is the system, not the account owner.
      await this.audit.record(tx, {
        organizationId: account.organizationId,
        actorKind: 'SYSTEM',
        action: 'APP_USER.PASSWORD_RESET_REQUESTED',
        resourceType: 'AppUser',
        resourceId: account.id,
        before: null,
        after: { event: 'PASSWORD_RESET_REQUESTED', at: now.toISOString() },
        correlationId: account.id,
      });
    });
  }

  private async performReset(token: string, newPassword: string): Promise<void> {
    // The length rules only: the email rule needs the account, which needs the token. A weak password is
    // refused before the token is looked at, so the answer reveals nothing about the link.
    const lengthViolation = checkPasswordPolicy(newPassword, '');
    if (lengthViolation && lengthViolation !== 'EQUALS_LOGIN_EMAIL') throw new PasswordPolicyError(lengthViolation);

    // A malformed or unknown token costs no Argon2 (R-09): the answer is the same generic error either way.
    if (!this.tokens.isWellFormedActionToken(token)) throw new PasswordResetInvalidError();
    const tokenHash = this.tokens.hashActionToken(token);
    const header = await this.accounts.findActionTokenHeader(tokenHash);
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
    const hash = await this.hasher.hash(newPassword);

    const outcome = await this.runner.run<'reset' | 'invalid' | PasswordPolicyError>(async (tx) => {
      // AppUser first, then the token (the order that cannot deadlock with lock/unlock and invitations).
      if (!(await this.accounts.lockAppUser(tx, appUserId, 'UPDATE'))) return 'invalid';
      const stored = await this.accounts.lockActionToken(tx, tokenHash);
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

      const emailViolation = checkPasswordPolicy(newPassword, account.loginEmail);
      if (emailViolation) return new PasswordPolicyError(emailViolation);

      await this.accounts.consumeToken(tx, tokenHash, now);
      // The link is spent: the mail that carries it, if still waiting, must not go out.
      await this.notifications.cancelPendingForTokens(tx, [tokenHash]);
      await this.credentials.replace(tx, {
        account,
        hash,
        event: 'PASSWORD_RESET',
        fullName: employee.fullName,
        // The holder of the link is the owner of the mailbox, which is as close to the account owner as this gets.
        actor: { actorKind: 'USER', actorAppUserId: appUserId, actorRoles: [], correlationId: appUserId },
        now,
      });
      if (stored.recoveryTicketId) {
        // A link the recovery procedure sent (US-01-09): opening it completes the ticket and, if the ticket moves the
        // login email, moves it now and not before (AC-10). The notice above already went to the old address.
        const moved = await this.completeRecovery(
          tx,
          account.id,
          account.organizationId,
          stored,
          employee.fullName,
          now,
        );
        if (moved === 'taken') return 'invalid';
      }

      return 'reset';
    });

    if (outcome instanceof PasswordPolicyError) throw outcome;
    if (outcome !== 'reset') throw new PasswordResetInvalidError();
  }

  /** Completes the ticket the link belonged to, and moves the login email if the ticket carried a new one. */
  private async completeRecovery(
    tx: DbTx,
    appUserId: string,
    organizationId: string,
    token: ActionTokenSnapshot,
    fullName: string,
    now: Date,
  ): Promise<'done' | 'taken'> {
    const ticket = token.recoveryTicketId ? await this.recoveries.lockById(tx, token.recoveryTicketId) : null;
    let changedTo: string | null = null;
    if (token.newLoginEmail && token.newNormalizedLoginEmail) {
      const other = await this.accounts.findAccountByLoginEmail(organizationId, token.newNormalizedLoginEmail);
      // Someone took the address since the link was sent: the link no longer works as it was approved.
      if (other && other.id !== appUserId) return 'taken';
      await this.accounts.changeLoginEmail(tx, appUserId, {
        loginEmail: token.newLoginEmail,
        normalizedLoginEmail: token.newNormalizedLoginEmail,
        now,
      });
      changedTo = token.newLoginEmail;
    }
    if (ticket) await this.recoveries.setStatus(tx, ticket.id, 'COMPLETED', now);
    await this.audit.record(tx, {
      organizationId,
      actorKind: 'USER',
      actorAppUserId: appUserId,
      actorRoles: [],
      action: 'SUPER_ADMIN.RECOVERY_COMPLETED',
      resourceType: 'AppUser',
      resourceId: appUserId,
      before: null,
      after: { ticket: ticket?.ticketRef ?? null, loginEmailChanged: changedTo !== null, fullName },
      correlationId: ticket?.id ?? appUserId,
    });

    return 'done';
  }

  private tryNormalize(email: string): string | null {
    try {
      return normalizeEmail(email);
    } catch (error) {
      if (error instanceof InvalidEmailError) return null;
      throw error;
    }
  }
}
