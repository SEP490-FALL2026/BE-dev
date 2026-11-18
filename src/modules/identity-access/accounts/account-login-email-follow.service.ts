import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../../../core/email';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { LoginEmailFollow } from '../../organization/public/organization.extension-points';
import { AppUserRepo } from './app-user.repo';

/**
 * The login email of an account is the work email of its employee, always (`POST /app-users` makes it so). When the Super Admin corrects the
 * work email of someone who has an account, the organization asks this to move the login email with it, in the same transaction: the old
 * address no longer signs in, the new one does. The sessions already open and the invitations still waiting are left as they are, and the
 * way the address was verified is not touched (nobody has verified the new one; an invited account is verified when it redeems).
 * Clearing the work email of someone who has an account is refused (`ACCOUNT_NEEDS_EMAIL`). A new address that another account already logs in with is refused with nothing written (`TAKEN`); the unique index backs the check.
 * The caller holds the employee `FOR UPDATE`, so this takes the account `FOR UPDATE` after it (lock order: the employee, then the account).
 */
/** What `follow` did: its answer, and the two addresses when the login email really moved (the caller then tells both). */
export interface LoginEmailFollowOutcome {
  result: LoginEmailFollow;
  moved: { previousEmail: string; currentEmail: string } | null;
}

@Injectable()
export class AccountLoginEmailFollowService {
  constructor(
    private readonly accounts: AppUserRepo,
    private readonly audit: AuditApi,
  ) {}

  async follow(
    tx: DbTx,
    input: { actor: AuthenticatedPrincipal; organizationId: string; employeeId: string; workEmail: string | null },
  ): Promise<LoginEmailFollowOutcome> {
    const accountId = await this.accounts.findAccountIdByEmployee(tx, input.employeeId);
    if (accountId === null) return { result: 'NO_ACCOUNT', moved: null };
    // The work email is being cleared: an account cannot have no login email, so nothing is written and the caller refuses.
    if (input.workEmail === null) return { result: 'ACCOUNT_NEEDS_EMAIL', moved: null };
    await this.accounts.lockAppUser(tx, accountId, 'UPDATE');
    // A statement of its own after the lock (lock protocol rule 2).
    const account = await this.accounts.findLoginEmailOfEmployee(tx, input.employeeId);
    if (account === null) return { result: 'NO_ACCOUNT', moved: null };

    const loginEmail = input.workEmail.trim();
    const normalized = normalizeEmail(loginEmail);
    const holder = await this.accounts.findAccountIdByNormalizedLoginEmail(tx, input.organizationId, normalized);
    if (holder !== null && holder !== account.id) return { result: 'TAKEN', moved: null };
    if (account.loginEmail === loginEmail) return { result: 'FOLLOWED', moved: null };

    await this.accounts.moveLoginEmail(tx, account.id, { loginEmail, normalizedLoginEmail: normalized });
    await this.audit.record(tx, {
      organizationId: input.organizationId,
      actorKind: 'USER',
      actorAppUserId: input.actor.appUserId,
      actorRoles: input.actor.roles,
      action: 'APP_USER.LOGIN_EMAIL_CHANGED',
      resourceType: 'AppUser',
      resourceId: account.id,
      before: { loginEmail: account.loginEmail },
      after: { loginEmail, employeeId: input.employeeId },
      correlationId: input.actor.sessionId,
    });

    return { result: 'FOLLOWED', moved: { previousEmail: account.loginEmail, currentEmail: loginEmail } };
  }
}
