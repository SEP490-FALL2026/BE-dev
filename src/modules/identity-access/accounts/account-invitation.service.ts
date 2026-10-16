import { Injectable } from '@nestjs/common';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import { OrganizationService } from '../../organization/organization.service';
import { EmployeeRecord } from '../../organization/organization.types';
import { PASSWORD_HASH_POLICY_VERSION, PasswordHasher } from '../auth/password-hasher.service';
import { checkPasswordPolicy } from '../auth/password.policy';
import { TokenService } from '../auth/token.service';
import {
  AccountAlreadyActivatedError,
  AccountAlreadyExistsError,
  AccountLockedError,
  AccountNotFoundError,
  EmployeeTerminatedError,
  FinanceAlreadyAssignedError,
  InvitationInvalidError,
  LoginEmailInvalidError,
  LoginEmailRequiredError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
  translateAccountWriteError,
} from '../errors/identity-access.errors';
import { PasswordPolicyError } from '../identity-access.errors';
import { AppRole } from '../identity-access.types';
import { accountAuditEvent, employeeHasNotLeft, isSelfChange, RequestedRole, validateRoleSet } from './account-policy';
import { AccountRepo } from './account.repo';

export interface CreateAccountInput {
  employeeId: string;
  loginEmail?: string;
  roles: RequestedRole[];
}

/**
 * Creating an account, inviting its owner and redeeming the invitation (slice 1b). Every method
 * that changes an account takes the AppUser row lock first and re-reads what it decides on (lock
 * protocol rules 1 and 2).
 */
@Injectable()
export class AccountInvitationService {
  constructor(
    private readonly accounts: AccountRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly runner: TransactionRunner,
  ) {}

  /** Creates the account, grants its roles and queues the invitation. Returns the new account's id. */
  async createAccount(actor: AuthenticatedPrincipal, input: CreateAccountInput): Promise<string> {
    const violation = validateRoleSet(input.roles);
    if (violation) throw new RoleRequestRefusedError(violation);

    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('Account creation before installation');
    const employee = await this.organization.getEmployee(input.employeeId);
    if (!employee) throw new EmployeeNotFoundError(input.employeeId);

    const roles = [...new Set(input.roles)] as AppRole[];

    return this.runner
      .run(async (tx) => {
        // Employee first (lock order 1), so the status checked here cannot change before commit.
        await this.organization.lockEmployeeForShare(tx, input.employeeId);
        const current = await this.organization.getEmployee(input.employeeId, tx);
        if (!current) throw new EmployeeNotFoundError(input.employeeId);
        if (!employeeHasNotLeft(current)) throw new EmployeeTerminatedError();
        // Resolved from the employee as locked, not from the earlier unlocked read (lock protocol rule 2).
        const rawEmail = input.loginEmail ?? current.workEmail;
        if (!rawEmail) throw new LoginEmailRequiredError();
        const normalized = this.normalizeLoginEmail(rawEmail);
        if ((await this.accounts.findAccountIdByEmployee(tx, input.employeeId)) !== null) {
          throw new AccountAlreadyExistsError();
        }
        if (roles.includes('FINANCE') && (await this.accounts.financeIsHeld(tx, organization.id))) {
          throw new FinanceAlreadyAssignedError();
        }

        const now = new Date();
        const user = await this.accounts.createAppUser(tx, {
          organizationId: organization.id,
          employeeId: input.employeeId,
          loginEmail: rawEmail.trim(),
          normalizedLoginEmail: normalized,
          status: 'ACTIVE',
          activationState: 'INVITED',
          emailVerificationSource: null,
          emailVerifiedAt: null,
        });
        for (const role of roles) {
          await this.accounts.grantRole(tx, {
            organizationId: organization.id,
            appUserId: user.id,
            role,
            grantedBy: actor.appUserId,
          });
          await this.audit.record(
            tx,
            accountAuditEvent(actor, organization.id, 'ROLE.GRANTED', user.id, null, { role }),
          );
        }
        await this.audit.record(
          tx,
          accountAuditEvent(actor, organization.id, 'APP_USER.CREATED', user.id, null, {
            employeeId: input.employeeId,
            loginEmail: rawEmail.trim(),
            status: 'ACTIVE',
            activationState: 'INVITED',
            roles,
          }),
        );
        await this.issueInvitation(tx, actor, organization.id, user.id, rawEmail.trim(), current, now);

        return user.id;
      })
      .catch((error: unknown) => {
        throw translateAccountWriteError(error);
      });
  }

  async resendInvitation(actor: AuthenticatedPrincipal, appUserId: string): Promise<void> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();

    await this.runner.run(async (tx) => {
      const account = await this.accounts.lockAndReadAccount(tx, appUserId);
      if (!account) throw new AccountNotFoundError();
      if (account.activationState === 'ACTIVATED') throw new AccountAlreadyActivatedError();
      if (account.status === 'LOCKED') throw new AccountLockedError();
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      if (!employeeHasNotLeft(employee)) throw new EmployeeTerminatedError();

      const now = new Date();
      // Every usable token goes, including an expired one that still holds the place (spec base).
      const usable = await this.accounts.findUsableTokens(tx, appUserId);
      const hashes = usable.map((token) => token.tokenHash);
      await this.accounts.revokeTokens(tx, hashes, 'SUPERSEDED', now);
      await this.notifications.cancelPendingForTokens(tx, hashes);
      await this.issueInvitation(tx, actor, account.organizationId, appUserId, account.loginEmail, employee, now);
    });
  }

  /**
   * Redeems an invitation link: sets the account's first password and activates it. Every reason
   * a link cannot be used gives the same InvitationInvalidError. The password length is checked
   * before the token is looked at, so a weak password reveals nothing about the token.
   */
  async redeemInvitation(token: string, password: string): Promise<void> {
    const lengthViolation = checkPasswordPolicy(password, '');
    if (lengthViolation && lengthViolation !== 'EQUALS_LOGIN_EMAIL') throw new PasswordPolicyError(lengthViolation);

    // Find the token first: a malformed or unknown token costs no Argon2 (R-09). The answer is the same
    // generic error either way, and a 256-bit random token cannot be guessed from the timing.
    if (!this.tokens.isWellFormedActionToken(token)) throw new InvitationInvalidError();
    const tokenHash = this.tokens.hashActionToken(token);
    const appUserId = await this.accounts.findActionTokenOwner(tokenHash);
    if (!appUserId) throw new InvitationInvalidError();

    // Hashing is the slow part and still happens before any lock (lock protocol rule 3).
    const hash = await this.hasher.hash(password);

    const outcome = await this.runner.run<'activated' | 'invalid' | PasswordPolicyError>(async (tx) => {
      // AppUser first, then the token (spec: the order that cannot deadlock with lock/unlock).
      if (!(await this.accounts.lockAppUser(tx, appUserId, 'UPDATE'))) return 'invalid';
      const stored = await this.accounts.lockActionToken(tx, tokenHash);
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

      const emailViolation = checkPasswordPolicy(password, account.loginEmail);
      if (emailViolation) return new PasswordPolicyError(emailViolation);

      await this.accounts.createCredential(tx, appUserId, hash, PASSWORD_HASH_POLICY_VERSION);
      await this.accounts.markActivated(tx, appUserId, now);
      await this.accounts.consumeToken(tx, tokenHash, now);
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

  private async issueInvitation(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    appUserId: string,
    recipient: string,
    employee: EmployeeRecord,
    now: Date,
  ): Promise<void> {
    const issued = this.tokens.newInvitationToken(now);
    await this.accounts.insertActionToken(tx, {
      tokenHash: issued.hash,
      appUserId,
      expiresAt: issued.expiresAt,
      createdBy: actor.appUserId,
    });
    await this.notifications.enqueueEmail(tx, {
      organizationId,
      recipient,
      template: 'ACCOUNT_INVITATION',
      locale: 'vi',
      actionTokenHash: issued.hash,
      payload: { token: issued.token, expiresAt: issued.expiresAt.toISOString(), fullName: employee.fullName },
    });
    await this.audit.record(
      tx,
      accountAuditEvent(actor, organizationId, 'APP_USER.INVITATION_SENT', appUserId, null, {
        expiresAt: issued.expiresAt.toISOString(),
      }),
    );
  }

  private normalizeLoginEmail(value: string): string {
    try {
      return normalizeEmail(value);
    } catch (error) {
      if (error instanceof InvalidEmailError) throw new LoginEmailInvalidError();
      throw error;
    }
  }
}
