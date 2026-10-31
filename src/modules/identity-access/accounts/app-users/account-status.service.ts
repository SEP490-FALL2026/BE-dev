import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { AppRole } from '../../public/identity-access.types';
import { translateAccountWriteError } from './account-constraints.errors';
import { AccountDirectoryService } from '../account-directory.service';
import {
  accountAuditEvent,
  checkRoleRequest,
  forbidsCombination,
  isSelfChange,
  RequestedRole,
  stopsLocking,
} from './account-administration.policy';
import {
  AccountNotFoundError,
  FinanceAlreadyAssignedError,
  RoleAlreadyGrantedError,
  RoleCombinationForbiddenError,
  RoleNotGrantedError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
  SuperAdminHolderNotLockableError,
} from '../account.errors';
import { ACCOUNT_SESSIONS, AccountSessions } from '../account-sessions.types';
import { ActionLinkRevocation } from '../action-link-revocation.service';
import { RoleGrantService } from '../role-grant.service';

/**
 * Lock, unlock and role grants of an account. Every method takes the AppUser row lock
 * first and re-reads what it decides on (lock protocol rules 1 and 2).
 */
@Injectable()
export class AccountStatusService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly grants: RoleGrantService,
    private readonly revocation: ActionLinkRevocation,
    @Inject(ACCOUNT_SESSIONS) private readonly sessions: AccountSessions,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  // --- lock and unlock --------------------------------------------------------------

  /** `reason` is the trimmed reason or authority reference the request carried; it is stored only when the state changes. */
  async lock(actor: AuthenticatedPrincipal, appUserId: string, reason: string): Promise<void> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();

    await this.runner.run(async (tx) => {
      const account = await this.accounts.lockAndReadAccount(tx, appUserId);
      if (!account) throw new AccountNotFoundError();
      if (stopsLocking(await this.grants.effectiveRoles(appUserId, tx))) throw new SuperAdminHolderNotLockableError();
      if (account.status === 'LOCKED') return;

      const now = new Date();
      await this.accounts.setStatus(tx, appUserId, 'LOCKED');
      const usable = await this.revocation.revokeUsable(tx, appUserId, 'ACCOUNT_LOCKED', now);
      const sessions = await this.sessions.revokeAllSessions(tx, appUserId, 'ACCOUNT_LOCKED', now);
      await this.audit.record(
        tx,
        accountAuditEvent(
          actor,
          account.organizationId,
          'APP_USER.LOCKED',
          appUserId,
          { status: 'ACTIVE' },
          { status: 'LOCKED', sessionsRevoked: sessions, invitationsRevoked: usable.length, reason },
        ),
      );
    });
  }

  async unlock(actor: AuthenticatedPrincipal, appUserId: string, reason: string): Promise<void> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();

    await this.runner.run(async (tx) => {
      const account = await this.accounts.lockAndReadAccount(tx, appUserId);
      if (!account) throw new AccountNotFoundError();
      if (account.status === 'ACTIVE') return;

      await this.accounts.setStatus(tx, appUserId, 'ACTIVE');
      await this.audit.record(
        tx,
        accountAuditEvent(
          actor,
          account.organizationId,
          'APP_USER.UNLOCKED',
          appUserId,
          { status: 'LOCKED' },
          { status: 'ACTIVE', reason },
        ),
      );
    });
  }

  // --- role grants ------------------------------------------------------------------

  async grantRole(actor: AuthenticatedPrincipal, appUserId: string, role: RequestedRole): Promise<void> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();
    const violation = checkRoleRequest(role);
    if (violation) throw new RoleRequestRefusedError(violation);
    const granted = role as AppRole;

    await this.runner
      .run(async (tx) => {
        const account = await this.accounts.lockAndReadAccount(tx, appUserId);
        if (!account) throw new AccountNotFoundError();
        const held = await this.grants.effectiveRoles(appUserId, tx);
        if (held.includes(granted)) throw new RoleAlreadyGrantedError();
        if (forbidsCombination(held, granted)) throw new RoleCombinationForbiddenError();
        if (granted === 'FINANCE' && (await this.grants.financeIsHeld(tx, account.organizationId))) {
          throw new FinanceAlreadyAssignedError();
        }

        await this.grants.grantRole(tx, {
          organizationId: account.organizationId,
          appUserId,
          role: granted,
          grantedBy: actor.appUserId,
        });
        await this.audit.record(
          tx,
          accountAuditEvent(
            actor,
            account.organizationId,
            'ROLE.GRANTED',
            appUserId,
            { roles: held },
            {
              roles: [...held, granted].sort(),
              role: granted,
            },
          ),
        );
      })
      .catch((error: unknown) => {
        throw translateAccountWriteError(error);
      });
  }

  async revokeRole(actor: AuthenticatedPrincipal, appUserId: string, role: RequestedRole): Promise<void> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();
    const violation = checkRoleRequest(role);
    if (violation) throw new RoleRequestRefusedError(violation);
    const revoked = role as AppRole;

    await this.runner.run(async (tx) => {
      const account = await this.accounts.lockAndReadAccount(tx, appUserId);
      if (!account) throw new AccountNotFoundError();
      const held = await this.grants.effectiveRoles(appUserId, tx);
      if (!held.includes(revoked)) throw new RoleNotGrantedError();

      await this.grants.revokeRole(tx, { appUserId, role: revoked, revokedBy: actor.appUserId, now: new Date() });
      await this.audit.record(
        tx,
        accountAuditEvent(
          actor,
          account.organizationId,
          'ROLE.REVOKED',
          appUserId,
          { roles: held },
          {
            roles: held.filter((entry) => entry !== revoked),
            role: revoked,
          },
        ),
      );
    });
  }
}
