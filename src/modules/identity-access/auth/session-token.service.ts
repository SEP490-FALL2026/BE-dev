import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IssuedSession } from '../public/identity-access.types';
import { SessionRepo } from './session.repo';
import { TokenService } from './token.service';

/**
 * The tokens of a session: the opaque refresh token (only its SHA-256 is stored) and the signed access token. Opening a
 * session issues the first pair; a refresh spends the presented refresh token and issues the next one. Both run inside
 * the caller's transaction, after the caller has taken and checked the locks.
 */
@Injectable()
export class SessionTokenService {
  constructor(
    private readonly sessions: SessionRepo,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** The hash of a presented refresh token, or null when it is absent or not shaped like one (never looked up). */
  hashPresented(refreshToken: string | undefined): string | null {
    if (!refreshToken || !this.tokens.isWellFormedRefreshToken(refreshToken)) return null;

    return this.tokens.hashRefreshToken(refreshToken);
  }

  /** Creates a session with its first refresh token and signs the access token. Runs inside a transaction. */
  async open(tx: DbTx, appUserId: string): Promise<IssuedSession> {
    const now = new Date();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.config.get('AUTH_SESSION_ABSOLUTE_SECONDS', { infer: true }) * 1000,
    );
    const idleExpiresAt = this.minDate(
      new Date(now.getTime() + this.config.get('AUTH_SESSION_IDLE_SECONDS', { infer: true }) * 1000),
      absoluteExpiresAt,
    );

    const session = await this.sessions.createSession(tx, { appUserId, idleExpiresAt, absoluteExpiresAt });
    const refresh = this.tokens.newRefreshToken();
    await this.sessions.insertRefreshToken(tx, {
      tokenHash: refresh.hash,
      sessionId: session.id,
      expiresAt: idleExpiresAt,
    });
    const access = await this.tokens.signAccessToken({ sub: appUserId, sid: session.id });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: idleExpiresAt,
    };
  }

  /**
   * Spends the presented refresh token and issues the next pair of the same session. The new idle expiry never passes
   * the session's absolute one. Runs inside the caller's transaction, under the session and token locks.
   */
  async rotate(
    tx: DbTx,
    input: { appUserId: string; sessionId: string; absoluteExpiresAt: Date; tokenHash: string; now: Date },
  ): Promise<IssuedSession> {
    const { now } = input;
    const next = this.tokens.newRefreshToken();
    const idleExpiresAt = this.minDate(
      new Date(now.getTime() + this.config.get('AUTH_SESSION_IDLE_SECONDS', { infer: true }) * 1000),
      input.absoluteExpiresAt,
    );
    await this.sessions.consumeRefreshToken(tx, input.tokenHash, next.hash, now);
    await this.sessions.insertRefreshToken(tx, {
      tokenHash: next.hash,
      sessionId: input.sessionId,
      expiresAt: idleExpiresAt,
    });
    await this.sessions.touchSession(tx, input.sessionId, { lastRefreshedAt: now, idleExpiresAt });

    const access = await this.tokens.signAccessToken({ sub: input.appUserId, sid: input.sessionId });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: next.token,
      refreshTokenExpiresAt: idleExpiresAt,
    };
  }

  private minDate(a: Date, b: Date): Date {
    return a <= b ? a : b;
  }
}
