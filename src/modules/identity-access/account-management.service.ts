import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { businessDateAt, toDateColumn } from '../../core/business-date';
import { InvalidEmailError, normalizeEmail } from '../../core/email';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { DbTx, TransactionRunner } from '../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../audit/audit.service';
import { AuditValue } from '../audit/audit.types';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryState } from '../notifications/notifications.types';
import { EmployeeNotFoundError } from '../organization/organization.errors';
import { OrganizationService } from '../organization/organization.service';
import { EmployeeCandidate, EmployeeRecord } from '../organization/organization.types';
import {
  checkRoleRequest,
  forbidsCombination,
  isSelfChange,
  RequestedRole,
  stopsLocking,
  validateRoleSet,
} from './account-policy';
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
  LoginEmailTakenError,
  PasswordPolicyError,
  RoleAlreadyGrantedError,
  RoleCombinationForbiddenError,
  RoleNotGrantedError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
  SuperAdminHolderNotLockableError,
} from './errors/identity-access.errors';
import { IdentityAccessRepo } from './identity-access.repo';
import {
  AccountListFilter,
  AccountRecord,
  ActivationState,
  AppRole,
  AppUserStatus,
  RoleGrantRecord,
} from './identity-access.types';
import { PASSWORD_HASH_POLICY_VERSION, PasswordHasher } from './password-hasher.service';
import { checkPasswordPolicy } from './password.policy';
import { TokenService } from './token.service';

export interface AccountView {
  id: string;
  loginEmail: string;
  status: AppUserStatus;
  activationState: ActivationState;
  createdAt: Date;
  employee: { id: string; employeeCode: string; fullName: string } | null;
  roles: AppRole[];
}

export interface InvitationView {
  /** Delivery state of the latest invitation mail; null when no invitation was ever created. */
  delivery: DeliveryState | null;
  /** Whether the latest link could still be used to activate the account. */
  usable: boolean;
  expiresAt: Date;
}

export interface AccountDetailView extends AccountView {
  roleHistory: RoleGrantRecord[];
  invitation: InvitationView | null;
}

export interface AccountPage {
  items: AccountView[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface CreateAccountInput {
  employeeId: string;
  loginEmail?: string;
  roles: RequestedRole[];
}

/**
 * Account administration by the Super Admin (slice 1b). Every method that changes an account
 * takes the AppUser row lock first and re-reads what it decides on (lock protocol rules 1 and 2).
 */
@Injectable()
export class AccountManagementService {
  constructor(
    private readonly repo: IdentityAccessRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly runner: TransactionRunner,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  // --- reads ------------------------------------------------------------------------

  /** Employees who have not left and have no account yet. */
  async listCandidates(search: string | undefined): Promise<EmployeeCandidate[]> {
    const organization = await this.organization.getOrganization();
    const today = toDateColumn(businessDateAt(new Date(), organization?.timeZone ?? 'UTC'));
    const matches = await this.organization.searchActiveEmployees(search, today, 200);
    const withAccount = await this.repo.findAccountEmployeeIds(matches.map((match) => match.id));

    return matches.filter((match) => !withAccount.has(match.id)).slice(0, 20);
  }

  async listAccounts(
    filter: Omit<AccountListFilter, 'skip' | 'take'> & { page: number; pageSize: number },
  ): Promise<AccountPage> {
    const { page, pageSize, ...criteria } = filter;
    const { items, total } = await this.repo.listAccountRecords({
      ...criteria,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const views = await this.toViews(items);

    return {
      items: views,
      pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getAccount(appUserId: string): Promise<AccountDetailView> {
    const record = await this.repo.findAccountRecord(appUserId);
    if (!record) throw new AccountNotFoundError();

    return this.toDetail(record);
  }

  // --- create and invite ------------------------------------------------------------

  async createAccount(actor: AuthenticatedPrincipal, input: CreateAccountInput): Promise<AccountDetailView> {
    const violation = validateRoleSet(input.roles);
    if (violation) throw new RoleRequestRefusedError(violation);

    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('Account creation before installation');
    const employee = await this.organization.getEmployee(input.employeeId);
    if (!employee) throw new EmployeeNotFoundError(input.employeeId);

    const roles = [...new Set(input.roles)] as AppRole[];

    const appUserId = await this.runner
      .run(async (tx) => {
        // Employee first (lock order 1), so the status checked here cannot change before commit.
        await this.organization.lockEmployeeForShare(tx, input.employeeId);
        const current = await this.organization.getEmployee(input.employeeId, tx);
        if (!current) throw new EmployeeNotFoundError(input.employeeId);
        if (current.status === 'TERMINATED') throw new EmployeeTerminatedError();
        // Resolved from the employee as locked, not from the earlier unlocked read (lock protocol rule 2).
        const rawEmail = input.loginEmail ?? current.workEmail;
        if (!rawEmail) throw new LoginEmailRequiredError();
        const normalized = this.normalizeLoginEmail(rawEmail);
        if ((await this.repo.findAccountIdByEmployee(tx, input.employeeId)) !== null) {
          throw new AccountAlreadyExistsError();
        }
        if (roles.includes('FINANCE') && (await this.repo.financeIsHeld(tx, organization.id))) {
          throw new FinanceAlreadyAssignedError();
        }

        const now = new Date();
        const user = await this.repo.createAppUser(tx, {
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
          await this.repo.grantRole(tx, {
            organizationId: organization.id,
            appUserId: user.id,
            role,
            grantedBy: actor.appUserId,
          });
          await this.recordAudit(tx, actor, organization.id, 'ROLE.GRANTED', user.id, null, { role });
        }
        await this.recordAudit(tx, actor, organization.id, 'APP_USER.CREATED', user.id, null, {
          employeeId: input.employeeId,
          loginEmail: rawEmail.trim(),
          status: 'ACTIVE',
          activationState: 'INVITED',
          roles,
        });
        await this.issueInvitation(tx, actor, organization.id, user.id, rawEmail.trim(), current, now);

        return user.id;
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    return this.getAccount(appUserId);
  }

  async resendInvitation(actor: AuthenticatedPrincipal, appUserId: string): Promise<AccountDetailView> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();

    await this.runner.run(async (tx) => {
      const account = await this.lockAndRead(tx, appUserId);
      if (account.activationState === 'ACTIVATED') throw new AccountAlreadyActivatedError();
      if (account.status === 'LOCKED') throw new AccountLockedError();
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      if (!employee || employee.status === 'TERMINATED') throw new EmployeeTerminatedError();

      const now = new Date();
      // Every usable token goes, including an expired one that still holds the place (spec base).
      const usable = await this.repo.findUsableTokens(tx, appUserId);
      const hashes = usable.map((token) => token.tokenHash);
      await this.repo.revokeTokens(tx, hashes, 'SUPERSEDED', now);
      await this.notifications.cancelPendingForTokens(tx, hashes);
      await this.issueInvitation(tx, actor, account.organizationId, appUserId, account.loginEmail, employee, now);
    });

    return this.getAccount(appUserId);
  }

  // --- lock and unlock --------------------------------------------------------------

  async lock(actor: AuthenticatedPrincipal, appUserId: string): Promise<AccountDetailView> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();

    await this.runner.run(async (tx) => {
      const account = await this.lockAndRead(tx, appUserId);
      if (stopsLocking(await this.repo.effectiveRoles(appUserId, tx))) throw new SuperAdminHolderNotLockableError();
      if (account.status === 'LOCKED') return;

      const now = new Date();
      await this.repo.setStatus(tx, appUserId, 'LOCKED');
      const usable = (await this.repo.findUsableTokens(tx, appUserId)).map((token) => token.tokenHash);
      await this.repo.revokeTokens(tx, usable, 'ACCOUNT_LOCKED', now);
      await this.notifications.cancelPendingForTokens(tx, usable);
      const sessions = await this.repo.revokeAllSessions(tx, appUserId, 'ACCOUNT_LOCKED', now);
      await this.recordAudit(
        tx,
        actor,
        account.organizationId,
        'APP_USER.LOCKED',
        appUserId,
        { status: 'ACTIVE' },
        { status: 'LOCKED', sessionsRevoked: sessions, invitationsRevoked: usable.length },
      );
    });

    return this.getAccount(appUserId);
  }

  async unlock(actor: AuthenticatedPrincipal, appUserId: string): Promise<AccountDetailView> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();

    await this.runner.run(async (tx) => {
      const account = await this.lockAndRead(tx, appUserId);
      if (account.status === 'ACTIVE') return;

      await this.repo.setStatus(tx, appUserId, 'ACTIVE');
      await this.recordAudit(
        tx,
        actor,
        account.organizationId,
        'APP_USER.UNLOCKED',
        appUserId,
        { status: 'LOCKED' },
        { status: 'ACTIVE' },
      );
    });

    return this.getAccount(appUserId);
  }

  // --- role grants ------------------------------------------------------------------

  async grantRole(actor: AuthenticatedPrincipal, appUserId: string, role: RequestedRole): Promise<AccountDetailView> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();
    const violation = checkRoleRequest(role);
    if (violation) throw new RoleRequestRefusedError(violation);
    const granted = role as AppRole;

    await this.runner
      .run(async (tx) => {
        const account = await this.lockAndRead(tx, appUserId);
        const held = await this.repo.effectiveRoles(appUserId, tx);
        if (held.includes(granted)) throw new RoleAlreadyGrantedError();
        if (forbidsCombination(held, granted)) throw new RoleCombinationForbiddenError();
        if (granted === 'FINANCE' && (await this.repo.financeIsHeld(tx, account.organizationId))) {
          throw new FinanceAlreadyAssignedError();
        }

        await this.repo.grantRole(tx, {
          organizationId: account.organizationId,
          appUserId,
          role: granted,
          grantedBy: actor.appUserId,
        });
        await this.recordAudit(
          tx,
          actor,
          account.organizationId,
          'ROLE.GRANTED',
          appUserId,
          { roles: held },
          {
            roles: [...held, granted].sort(),
            role: granted,
          },
        );
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    return this.getAccount(appUserId);
  }

  async revokeRole(actor: AuthenticatedPrincipal, appUserId: string, role: RequestedRole): Promise<AccountDetailView> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();
    const violation = checkRoleRequest(role);
    if (violation) throw new RoleRequestRefusedError(violation);
    const revoked = role as AppRole;

    await this.runner.run(async (tx) => {
      const account = await this.lockAndRead(tx, appUserId);
      const held = await this.repo.effectiveRoles(appUserId, tx);
      if (!held.includes(revoked)) throw new RoleNotGrantedError();

      await this.repo.revokeRole(tx, { appUserId, role: revoked, revokedBy: actor.appUserId, now: new Date() });
      await this.recordAudit(
        tx,
        actor,
        account.organizationId,
        'ROLE.REVOKED',
        appUserId,
        { roles: held },
        {
          roles: held.filter((entry) => entry !== revoked),
          role: revoked,
        },
      );
    });

    return this.getAccount(appUserId);
  }

  // --- activation -------------------------------------------------------------------

  /**
   * Redeems an invitation link: sets the account's first password and activates it. Every reason
   * a link cannot be used gives the same InvitationInvalidError. The password length is checked
   * before the token is looked at, so a weak password reveals nothing about the token.
   */
  async redeemInvitation(token: string, password: string): Promise<void> {
    const lengthViolation = checkPasswordPolicy(password, '');
    if (lengthViolation && lengthViolation !== 'EQUALS_LOGIN_EMAIL') throw new PasswordPolicyError(lengthViolation);

    // Hashing is the slow part and happens before any lock (lock protocol rule 3).
    const hash = await this.hasher.hash(password);
    if (!this.tokens.isWellFormedActionToken(token)) throw new InvitationInvalidError();
    const tokenHash = this.tokens.hashActionToken(token);
    const appUserId = await this.repo.findActionTokenOwner(tokenHash);
    if (!appUserId) throw new InvitationInvalidError();

    const outcome = await this.runner.run<'activated' | 'invalid' | PasswordPolicyError>(async (tx) => {
      // AppUser first, then the token (spec: the order that cannot deadlock with lock/unlock).
      if (!(await this.repo.lockAppUser(tx, appUserId, 'UPDATE'))) return 'invalid';
      const stored = await this.repo.lockActionToken(tx, tokenHash);
      const account = await this.repo.findAccountRecord(appUserId, tx);
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
        employee !== null &&
        employee.status !== 'TERMINATED';
      if (!usable) return 'invalid';

      const emailViolation = checkPasswordPolicy(password, account.loginEmail);
      if (emailViolation) return new PasswordPolicyError(emailViolation);

      await this.repo.createCredential(tx, appUserId, hash, PASSWORD_HASH_POLICY_VERSION);
      await this.repo.markActivated(tx, appUserId, now);
      await this.repo.consumeToken(tx, tokenHash, now);
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

  /** Whether the link behind this token hash would still work; the dispatcher asks this before sending. */
  isInvitationLinkUsable(tokenHash: string): Promise<boolean> {
    return this.repo.isTokenRedeemable(tokenHash, new Date());
  }

  // --- internals --------------------------------------------------------------------

  private async lockAndRead(tx: DbTx, appUserId: string): Promise<AccountRecord> {
    if (!(await this.repo.lockAppUser(tx, appUserId, 'UPDATE'))) throw new AccountNotFoundError();
    // A separate statement after the lock, so what is read is what the lock now protects (rule 7).
    const account = await this.repo.findAccountRecord(appUserId, tx);
    if (!account) throw new AccountNotFoundError();

    return account;
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
    const ttlMs = this.config.get('AUTH_INVITATION_TTL_SECONDS', { infer: true }) * 1000;
    const expiresAt = new Date(now.getTime() + ttlMs);
    const issued = this.tokens.newActionToken();
    await this.repo.insertActionToken(tx, {
      tokenHash: issued.hash,
      appUserId,
      expiresAt,
      createdBy: actor.appUserId,
    });
    await this.notifications.enqueueEmail(tx, {
      organizationId,
      recipient,
      template: 'ACCOUNT_INVITATION',
      locale: 'vi',
      actionTokenHash: issued.hash,
      payload: { token: issued.token, expiresAt: expiresAt.toISOString(), fullName: employee.fullName },
    });
    await this.recordAudit(tx, actor, organizationId, 'APP_USER.INVITATION_SENT', appUserId, null, {
      expiresAt: expiresAt.toISOString(),
    });
  }

  private async recordAudit(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    action: string,
    resourceId: string,
    before: { [key: string]: AuditValue } | null,
    after: { [key: string]: AuditValue } | null,
  ): Promise<void> {
    await this.audit.record(tx, {
      organizationId,
      actorKind: 'USER',
      actorAppUserId: actor.appUserId,
      actorRoles: actor.roles,
      action,
      resourceType: 'AppUser',
      resourceId,
      before,
      after,
      correlationId: actor.sessionId,
    });
  }

  /** Maps a constraint that caught a race to the same business error the pre-checks give. */
  private translateWriteError(error: unknown): unknown {
    if (isUniqueViolation(error, 'role_grants_one_finance')) return new FinanceAlreadyAssignedError();
    if (isUniqueViolation(error, 'role_grants_one_effective_per_role')) return new RoleAlreadyGrantedError();
    if (isUniqueViolation(error, 'app_users_employee_id_key')) return new AccountAlreadyExistsError();
    if (isUniqueViolation(error, 'app_users_organization_id_normalized_login_email_key', 'normalized_login_email')) {
      return new LoginEmailTakenError();
    }
    if (isCheckViolation(error)) return new RoleCombinationForbiddenError();

    return error;
  }

  private normalizeLoginEmail(value: string): string {
    try {
      return normalizeEmail(value);
    } catch (error) {
      if (error instanceof InvalidEmailError) throw new LoginEmailInvalidError();
      throw error;
    }
  }

  private async toViews(records: AccountRecord[]): Promise<AccountView[]> {
    const employees = new Map(
      (await this.organization.getEmployees(records.map((record) => record.employeeId))).map((employee) => [
        employee.id,
        employee,
      ]),
    );
    const roles = await this.repo.effectiveRolesFor(records.map((record) => record.id));

    return records.map((record) => {
      const employee = employees.get(record.employeeId);

      return {
        id: record.id,
        loginEmail: record.loginEmail,
        status: record.status,
        activationState: record.activationState,
        createdAt: record.createdAt,
        employee: employee
          ? { id: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName }
          : null,
        roles: roles.get(record.id) ?? [],
      };
    });
  }

  private async toDetail(record: AccountRecord): Promise<AccountDetailView> {
    const [view] = await this.toViews([record]);
    const [roleHistory, token] = await Promise.all([
      this.repo.grantHistory(record.id),
      this.repo.latestToken(record.id),
    ]);
    let invitation: InvitationView | null = null;
    if (token) {
      const delivery = (await this.notifications.deliveryStates([token.tokenHash])).get(token.tokenHash) ?? null;
      invitation = {
        delivery,
        usable: token.consumedAt === null && token.revokedAt === null && token.expiresAt > new Date(),
        expiresAt: token.expiresAt,
      };
    }

    return { ...view, roleHistory, invitation };
  }
}
