import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { employeeHasNotLeft } from '../accounts/account-policy';
import { AccountRepo } from '../accounts/account.repo';
import { SessionInvalidError } from '../errors/identity-access.errors';
import { IssuedSession } from '../identity-access.types';
import { SessionRepo } from './session.repo';
import { TokenService } from './token.service';

/** Outcome carried out of a transaction that must commit even though the request fails. */
type RefreshOutcome = { kind: 'issued'; session: IssuedSession } | { kind: 'invalid' } | { kind: 'replayed' };

/** Refreshing and ending a session. */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly accounts: AccountRepo,
    private readonly sessions: SessionRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
    private readonly runner: TransactionRunner,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  // --- refresh ----------------------------------------------------------------------

  /** Throws SessionInvalidError for every reason a refresh cannot proceed, including replay. */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    try {
      return await this.performRefresh(refreshToken);
    } catch (error) {
      throw this.asTransient(error);
    }
  }

  private async performRefresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken || !this.tokens.isWellFormedRefreshToken(refreshToken)) throw new SessionInvalidError();

    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
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

      const next = this.tokens.newRefreshToken();
      const idleExpiresAt = this.minDate(
        new Date(now.getTime() + this.config.get('AUTH_SESSION_IDLE_SECONDS', { infer: true }) * 1000),
        session.absoluteExpiresAt,
      );
      await this.sessions.consumeRefreshToken(tx, tokenHash, next.hash, now);
      await this.sessions.insertRefreshToken(tx, {
        tokenHash: next.hash,
        sessionId: session.id,
        expiresAt: idleExpiresAt,
      });
      await this.sessions.touchSession(tx, session.id, { lastRefreshedAt: now, idleExpiresAt });

      const access = await this.tokens.signAccessToken({ sub: account.id, sid: session.id });

      return {
        kind: 'issued',
        session: {
          accessToken: access.token,
          accessTokenExpiresAt: access.expiresAt,
          refreshToken: next.token,
        },
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
   * Revokes the session the cookie belongs to. Idempotent: an absent, malformed, unknown,
   * already-revoked or expired token is a no-op. Only a database failure surfaces.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    try {
      if (!refreshToken || !this.tokens.isWellFormedRefreshToken(refreshToken)) return;

      const owner = await this.sessions.findRefreshTokenOwner(this.tokens.hashRefreshToken(refreshToken));
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

  private minDate(a: Date, b: Date): Date {
    return a <= b ? a : b;
  }

  /** Database trouble from the unlocked reads (outside the runner) becomes the same transient error. */
  private asTransient(error: unknown): unknown {
    return toTransientError(error) ?? error;
  }
}
