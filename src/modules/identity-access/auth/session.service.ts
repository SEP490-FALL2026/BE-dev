import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { IssuedSession } from '../public/identity-access.types';
import { employeeHasNotLeft } from '../accounts/account.policy';
import { SessionInvalidError } from './auth.errors';
import { SessionTokenService } from './session-token.service';
import { SessionRepo } from './session.repo';

/** Outcome carried out of a transaction that must commit even though the request fails. */
type RefreshOutcome = { kind: 'issued'; session: IssuedSession } | { kind: 'invalid' } | { kind: 'replayed' };

/** Refreshing and ending a session. */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly sessions: SessionRepo,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly sessionTokens: SessionTokenService,
    private readonly runner: TransactionRunner,
  ) {}

  // --- refresh ----------------------------------------------------------------------

  /** Throws SessionInvalidError for every reason a refresh cannot proceed, including replay. */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    try {
      return await this.authenticateAndRotate(refreshToken);
    } catch (error) {
      throw this.asTransient(error);
    }
  }

  /**
   * Authenticates the opaque refresh token and, if it is valid, spends it and issues the next pair. There is no
   * signature to verify (it is not a JWT): the token is authenticated by its shape, the SHA-256 lookup, the row locks
   * and the session, account, employee, expiry and consumed state read under those locks. Expiry is checked before
   * consumption, so an expired token is refused without being treated as replay.
   */
  private async authenticateAndRotate(refreshToken: string | undefined): Promise<IssuedSession> {
    const tokenHash = this.sessionTokens.hashPresented(refreshToken);
    if (tokenHash === null) throw new SessionInvalidError();

    const owner = await this.sessions.findRefreshTokenOwner(tokenHash);
    if (!owner) throw new SessionInvalidError();

    const outcome = await this.runner.run<RefreshOutcome>(async (tx) => {
      // Lock order: AppUser (SHARE) -> AuthSession -> RefreshToken. Then re-read everything.
      if (!(await this.accounts.lockAppUser(tx, owner.appUserId, 'SHARE'))) return { kind: 'invalid' };
      const session = await this.sessions.lockSession(tx, owner.sessionId);
      const token = await this.sessions.lockRefreshToken(tx, tokenHash);
      const account = await this.accounts.readAccount(tx, owner.appUserId);
      if (!session || !token || !account || token.sessionId !== session.id) return { kind: 'invalid' };

      const now = new Date();
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      const accountUsable =
        account.status === 'ACTIVE' && account.activationState === 'ACTIVATED' && employeeHasNotLeft(employee);
      const sessionOpen = session.revokedAt === null && session.idleExpiresAt > now && session.absoluteExpiresAt > now;
      if (!accountUsable || !sessionOpen || token.expiresAt <= now) return { kind: 'invalid' };

      if (token.consumedAt !== null) {
        // A token that was already exchanged is being presented again: assume it leaked and end
        // the session. The revocation and its audit row must commit, so this is a result, not a throw.
        await this.sessions.revokeSession(tx, session.id, 'REPLAY_DETECTED', now);
        await this.audit.record(tx, {
          organizationId: account.organizationId,
          actorKind: 'SYSTEM',
          action: 'SESSION.REVOKED',
          resourceType: 'AuthSession',
          resourceId: session.id,
          before: { revoked: false },
          after: { revoked: true, reason: 'REPLAY_DETECTED' },
          correlationId: session.id,
        });

        return { kind: 'replayed' };
      }

      return {
        kind: 'issued',
        session: await this.sessionTokens.rotate(tx, {
          appUserId: account.id,
          sessionId: session.id,
          absoluteExpiresAt: session.absoluteExpiresAt,
          tokenHash,
          now,
        }),
      };
    });

    if (outcome.kind !== 'issued') {
      if (outcome.kind === 'replayed') this.logger.warn('Refresh token replay detected; session revoked');
      throw new SessionInvalidError();
    }

    return outcome.session;
  }

  // --- logout -----------------------------------------------------------------------

  /**
   * Revokes the session that owns the refresh token sent in the request body. Idempotent: an absent, malformed or
   * unknown token, or one whose session is already revoked or expired, is a no-op. The state of the token itself is not
   * read: a spent or expired refresh token of a session that is still open ends that session. Only a database failure
   * surfaces.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    try {
      const tokenHash = this.sessionTokens.hashPresented(refreshToken);
      if (tokenHash === null) return;

      const owner = await this.sessions.findRefreshTokenOwner(tokenHash);
      if (!owner) return;

      await this.runner.run(async (tx) => {
        if (!(await this.accounts.lockAppUser(tx, owner.appUserId, 'SHARE'))) return;
        const session = await this.sessions.lockSession(tx, owner.sessionId);
        const now = new Date();
        if (
          !session ||
          session.revokedAt !== null ||
          session.absoluteExpiresAt <= now ||
          session.idleExpiresAt <= now
        ) {
          return;
        }

        await this.sessions.revokeSession(tx, session.id, 'LOGOUT', now);
      });
    } catch (error) {
      throw this.asTransient(error);
    }
  }

  /** Database trouble from the unlocked reads (outside the runner) becomes the same transient error. */
  private asTransient(error: unknown): unknown {
    return toTransientError(error) ?? error;
  }
}
