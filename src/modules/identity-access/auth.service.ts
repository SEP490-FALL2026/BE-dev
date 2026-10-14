import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvalidEmailError, normalizeEmail } from '../../core/email';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { DbTx, TransactionRunner, toTransientError } from '../../infrastructure/database/transaction-runner';
import { AuditService } from '../audit/audit.service';
import { OrganizationService } from '../organization/organization.service';
import {
  InvalidCredentialsError,
  LoginTemporarilyBlockedError,
  SessionInvalidError,
} from './errors/identity-access.errors';
import { IdentityAccessRepo } from './identity-access.repo';
import { AccountSnapshot, IssuedSession } from './identity-access.types';
import { PasswordHasher } from './password-hasher.service';
import { TokenService } from './token.service';

/** Outcome carried out of a transaction that must commit even though the request fails. */
type RefreshOutcome = { kind: 'issued'; session: IssuedSession } | { kind: 'invalid' } | { kind: 'replayed' };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: IdentityAccessRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly runner: TransactionRunner,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  // --- login ------------------------------------------------------------------------

  /**
   * Throws InvalidCredentialsError (one outcome for every reason), LoginTemporarilyBlockedError
   * or, when the database fails, TransientDatabaseError.
   */
  async login(email: string, password: string): Promise<IssuedSession> {
    try {
      return await this.performLogin(email, password);
    } catch (error) {
      throw this.asTransient(error);
    }
  }

  private async performLogin(email: string, password: string): Promise<IssuedSession> {
    const organization = await this.organization.getOrganization();
    if (!organization) {
      await this.hasher.verifyAgainstDummy(password);
      throw new InvalidCredentialsError();
    }

    const normalized = this.safeNormalize(email);
    const keyHash = this.tokens.throttleKey(normalized);
    const now = new Date();

    const throttle = await this.repo.findThrottle(organization.id, keyHash);
    if (throttle?.blockedUntil && throttle.blockedUntil > now) {
      throw new LoginTemporarilyBlockedError(Math.ceil((throttle.blockedUntil.getTime() - now.getTime()) / 1000));
    }

    // Everything CPU-heavy happens before the transaction (lock protocol rule 3).
    const account = await this.repo.findAccountByLoginEmail(organization.id, normalized);
    const verifiedHash = await this.verifyPassword(account, password);
    const employee = account ? await this.organization.getEmployee(account.employeeId) : null;
    const usable =
      verifiedHash !== null &&
      account !== null &&
      account.status === 'ACTIVE' &&
      account.activationState === 'ACTIVATED' &&
      employee !== null &&
      employee.status !== 'TERMINATED';

    if (!usable) {
      // Only a wrong attempt is a failure. An attempt still being checked, or one that succeeds, is
      // not counted (R-06): the counter is raised here, after the check, in one atomic statement so
      // simultaneous wrong guesses are all counted.
      await this.recordFailure(organization.id, keyHash);
      throw new InvalidCredentialsError();
    }

    const result = await this.runner.run(async (tx) => {
      // AppUser FOR SHARE first: a lock or password change that committed earlier is now visible.
      if (!(await this.repo.lockAppUser(tx, account.id, 'SHARE'))) return null;

      const current = await this.repo.readAccount(tx, account.id);
      const employeeNow = await this.organization.getEmployee(account.employeeId, tx);
      const unchanged =
        current !== null &&
        current.status === 'ACTIVE' &&
        current.activationState === 'ACTIVATED' &&
        current.credentialHash === verifiedHash &&
        employeeNow !== null &&
        employeeNow.status !== 'TERMINATED';
      if (!unchanged) return null;

      const session = await this.openSession(tx, account.id);
      await this.repo.clearThrottle(tx, organization.id, keyHash);

      return session;
    });

    // State changed between the check and the lock: same answer as any other failure.
    if (result === null) throw new InvalidCredentialsError();

    return result;
  }

  private async verifyPassword(account: AccountSnapshot | null, password: string): Promise<string | null> {
    if (!account?.credentialHash) {
      await this.hasher.verifyAgainstDummy(password);
      return null;
    }

    return (await this.hasher.verify(account.credentialHash, password)) ? account.credentialHash : null;
  }

  private async recordFailure(organizationId: string, emailKeyHash: string): Promise<void> {
    const now = new Date();
    const windowMs = this.config.get('AUTH_LOGIN_WINDOW_SECONDS', { infer: true }) * 1000;
    const blockMs = this.config.get('AUTH_LOGIN_BLOCK_SECONDS', { infer: true }) * 1000;

    await this.repo.recordLoginFailure({
      organizationId,
      emailKeyHash,
      now,
      windowCutoff: new Date(now.getTime() - windowMs),
      maxFailures: this.config.get('AUTH_LOGIN_MAX_FAILURES', { infer: true }),
      blockedUntil: new Date(now.getTime() + blockMs),
    });
  }

  /** An unparseable email still goes through throttling and the dummy hash, under its raw form. */
  private safeNormalize(email: string): string {
    try {
      return normalizeEmail(email);
    } catch (error) {
      if (error instanceof InvalidEmailError) return `invalid:${email.trim().toLowerCase()}`;
      throw error;
    }
  }

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
    const owner = await this.repo.findRefreshTokenOwner(tokenHash);
    if (!owner) throw new SessionInvalidError();

    const outcome = await this.runner.run<RefreshOutcome>(async (tx) => {
      // Lock order: AppUser (SHARE) -> AuthSession -> RefreshToken. Then re-read everything.
      if (!(await this.repo.lockAppUser(tx, owner.appUserId, 'SHARE'))) return { kind: 'invalid' };
      const session = await this.repo.lockSession(tx, owner.sessionId);
      const token = await this.repo.lockRefreshToken(tx, tokenHash);
      const account = await this.repo.readAccount(tx, owner.appUserId);
      if (!session || !token || !account || token.sessionId !== session.id) return { kind: 'invalid' };

      const now = new Date();
      const employee = await this.organization.getEmployee(account.employeeId, tx);
      const accountUsable =
        account.status === 'ACTIVE' &&
        account.activationState === 'ACTIVATED' &&
        employee !== null &&
        employee.status !== 'TERMINATED';
      const sessionOpen = session.revokedAt === null && session.idleExpiresAt > now && session.absoluteExpiresAt > now;
      if (!accountUsable || !sessionOpen || token.expiresAt <= now) return { kind: 'invalid' };

      if (token.consumedAt !== null) {
        // A token that was already exchanged is being presented again: assume it leaked and end
        // the session. The revocation and its audit row must commit, so this is a result, not a throw.
        await this.repo.revokeSession(tx, session.id, 'REPLAY_DETECTED', now);
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
      await this.repo.consumeRefreshToken(tx, tokenHash, next.hash, now);
      await this.repo.insertRefreshToken(tx, { tokenHash: next.hash, sessionId: session.id, expiresAt: idleExpiresAt });
      await this.repo.touchSession(tx, session.id, { lastRefreshedAt: now, idleExpiresAt });

      const access = await this.tokens.signAccessToken({ sub: account.id, sid: session.id });

      return {
        kind: 'issued',
        session: {
          accessToken: access.token,
          accessTokenExpiresAt: access.expiresAt,
          refreshToken: next.token,
          sessionRemainingMs: session.absoluteExpiresAt.getTime() - now.getTime(),
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

      const owner = await this.repo.findRefreshTokenOwner(this.tokens.hashRefreshToken(refreshToken));
      if (!owner) return;

      await this.runner.run(async (tx) => {
        if (!(await this.repo.lockAppUser(tx, owner.appUserId, 'SHARE'))) return;
        const session = await this.repo.lockSession(tx, owner.sessionId);
        const now = new Date();
        if (
          !session ||
          session.revokedAt !== null ||
          session.absoluteExpiresAt <= now ||
          session.idleExpiresAt <= now
        ) {
          return;
        }

        await this.repo.revokeSession(tx, session.id, 'LOGOUT', now);
      });
    } catch (error) {
      throw this.asTransient(error);
    }
  }

  // --- shared -----------------------------------------------------------------------

  /** Creates a session with its first refresh token and signs the access token. Runs inside a transaction. */
  private async openSession(tx: DbTx, appUserId: string): Promise<IssuedSession> {
    const now = new Date();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.config.get('AUTH_SESSION_ABSOLUTE_SECONDS', { infer: true }) * 1000,
    );
    const idleExpiresAt = this.minDate(
      new Date(now.getTime() + this.config.get('AUTH_SESSION_IDLE_SECONDS', { infer: true }) * 1000),
      absoluteExpiresAt,
    );

    const session = await this.repo.createSession(tx, { appUserId, idleExpiresAt, absoluteExpiresAt });
    const refresh = this.tokens.newRefreshToken();
    await this.repo.insertRefreshToken(tx, {
      tokenHash: refresh.hash,
      sessionId: session.id,
      expiresAt: idleExpiresAt,
    });
    const access = await this.tokens.signAccessToken({ sub: appUserId, sid: session.id });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      sessionRemainingMs: absoluteExpiresAt.getTime() - now.getTime(),
    };
  }

  private minDate(a: Date, b: Date): Date {
    return a <= b ? a : b;
  }

  /** Database trouble from the unlocked reads (outside the runner) becomes the same transient error. */
  private asTransient(error: unknown): unknown {
    return toTransientError(error) ?? error;
  }
}
