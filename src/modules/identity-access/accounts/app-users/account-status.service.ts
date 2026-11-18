import { Inject, Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { AccountRecord, AppRole } from '../../public/identity-access.types';
import { translateAccountWriteError } from './account-constraints.errors';
import { AccountRecordService } from '../account-record.service';
import {
  accountAuditEvent,
  checkRoleRequest,
  isSelfChange,
  RequestedRole,
  stopsLocking,
} from './account-administration.policy';
import {
  AccountNotFoundError,
  FinanceAlreadyAssignedError,
  ManagerStillHeadingError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
  SpendingApproverHeadsDepartmentError,
  SuperAdminHolderNotLockableError,
} from '../account.errors';
import { ACCOUNT_SESSIONS, AccountSessions } from '../account-sessions.types';
import { ActionLinkRevocation } from '../action-link-revocation.service';
import { RoleGrantService } from '../role-grant.service';
import { SpendingApproverGrantService } from './spending-approver-grant.service';

/**
 * Lock, unlock and role grants of an account. Every method takes the AppUser row lock
 * first and re-reads what it decides on (lock protocol rules 1 and 2).
 */
@Injectable()
export class AccountStatusService {
  constructor(
    private readonly accounts: AccountRecordService,
    private readonly grants: RoleGrantService,
    private readonly revocation: ActionLinkRevocation,
    @Inject(ACCOUNT_SESSIONS) private readonly sessions: AccountSessions,
    private readonly audit: AuditApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly spendingApprover: SpendingApproverGrantService,
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
      // The departure of the employee: a block it left in force after it was cancelled is lifted with the unlock and the reason
      // (QĐ-100q, QĐ-81); one whose departure is still alive is not the Super Admin's to lift.
      const released = await this.accounts.releaseDepartureBlockForUnlock(tx, account.employeeId);
      if (account.status === 'ACTIVE' && !released) return;

      if (account.status === 'LOCKED') await this.accounts.setStatus(tx, appUserId, 'ACTIVE');
      await this.audit.record(
        tx,
        accountAuditEvent(
          actor,
          account.organizationId,
          'APP_USER.UNLOCKED',
          appUserId,
          { status: account.status },
          { status: 'ACTIVE', reason, ...(released ? { departureBlockReleased: true } : {}) },
        ),
      );
    });
  }

  // --- role grants ------------------------------------------------------------------

  /** Replaces the sole effective role under the approval-role, employee and account locks, in that order. */
  async changeRole(actor: AuthenticatedPrincipal, appUserId: string, role: RequestedRole): Promise<void> {
    if (isSelfChange(actor.appUserId, appUserId)) throw new SelfChangeForbiddenError();
    const violation = checkRoleRequest(role);
    if (violation) throw new RoleRequestRefusedError(violation);
    let employeeId: string | null = null;
    await this.runner
      .run(async (tx) => {
        await this.grants.lockApprovalRolesForChange(tx);
        const known = await this.accounts.readAccount(tx, appUserId);
        if (!known) throw new AccountNotFoundError();
        await this.organizationReads.lockEmployeeForShare(tx, known.employeeId);
        const account = await this.accounts.lockAndReadAccount(tx, appUserId);
        if (!account) throw new AccountNotFoundError();
        employeeId = account.employeeId;
        const held = await this.grants.effectiveRoles(appUserId, tx);
        if (held.includes('SUPER_ADMIN')) throw new RoleRequestRefusedError('SUPER_ADMIN_TRANSFER_ONLY');
        if (held.length !== 1) throw new Error('Changing a role requires exactly one effective grant');
        const previous = held[0];
        if (previous === role) return;
        await this.checkRoleReplacement(tx, account, previous, role);
        // One instant for both rows: the history never shows two effective roles, nor a moment without one.
        const now = new Date();
        await this.grants.revokeRole(tx, { appUserId, role: previous, revokedBy: actor.appUserId, now });
        await this.grants.grantRole(tx, {
          organizationId: account.organizationId,
          appUserId,
          role,
          grantedBy: actor.appUserId,
          grantedAt: now,
        });
        await this.audit.record(
          tx,
          accountAuditEvent(actor, account.organizationId, 'ROLE.CHANGED', appUserId, { role: previous }, { role }),
        );
      })
      .catch(async (error: unknown) => {
        throw await this.translateRoleWriteError(error, employeeId);
      });
  }

  private async checkRoleReplacement(
    tx: DbTx,
    account: AccountRecord,
    previous: AppRole,
    role: AppRole,
  ): Promise<void> {
    if (previous === 'MANAGER') {
      const periods = await this.organizationReads.headPeriodsFrom(account.employeeId, undefined, tx);
      if (periods.length > 0) throw new ManagerStillHeadingError(periods);
    }
    if (role === 'FINANCE' && (await this.grants.financeIsHeld(tx, account.organizationId))) {
      throw new FinanceAlreadyAssignedError();
    }
    if (role === 'SPENDING_APPROVER') await this.spendingApprover.check(tx, account);
  }

  /** A refusal that only the database could make (the race with a head assignment) shows the periods as they are now. */
  private async translateRoleWriteError(error: unknown, employeeId: string | null): Promise<unknown> {
    const translated = translateAccountWriteError(error);
    if (employeeId === null) return translated;
    if (translated instanceof ManagerStillHeadingError) {
      return new ManagerStillHeadingError(await this.organizationReads.headPeriodsFrom(employeeId));
    }
    if (translated instanceof SpendingApproverHeadsDepartmentError) {
      return new SpendingApproverHeadsDepartmentError(await this.organizationReads.headPeriodsFrom(employeeId));
    }

    return translated;
  }
}
