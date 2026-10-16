import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { InvalidAccessTokenError } from '../../../infrastructure/security/tokens/access-token-verifier.port';

export interface AccessTokenClaims {
  /** AppUser id. */
  sub: string;
  /** AuthSession id. */
  sid: string;
}

const REFRESH_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_SHAPE.test(value);
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async signAccessToken(claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }> {
    const ttlSeconds = this.config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const token = await this.jwt.signAsync({ sid: claims.sid }, { subject: claims.sub });

    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  /** Throws InvalidAccessTokenError for anything that is not a currently valid token signed by this service. */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    let payload: { sub?: unknown; sid?: unknown };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: unknown; sid?: unknown }>(token);
    } catch {
      throw new InvalidAccessTokenError();
    }

    // Both ids end up in a UUID column. A validly signed token with anything else is still a bad token
    // (401); letting it reach the database would turn the driver's type error into a 503 (R-04).
    if (!isUuid(payload.sub) || !isUuid(payload.sid)) throw new InvalidAccessTokenError();

    return { sub: payload.sub, sid: payload.sid };
  }

  /** 256 bits of randomness; only its SHA-256 is stored. */
  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');

    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * One-time token behind an emailed invitation link: 256 bits of randomness, only its SHA-256 is
   * stored. It expires AUTH_INVITATION_TTL_SECONDS after `now`.
   */
  newInvitationToken(now: Date): { token: string; hash: string; expiresAt: Date } {
    const ttlMs = this.config.get('AUTH_INVITATION_TTL_SECONDS', { infer: true }) * 1000;
    const token = randomBytes(32).toString('base64url');

    return { token, hash: this.hashRefreshToken(token), expiresAt: new Date(now.getTime() + ttlMs) };
  }

  hashActionToken(token: string): string {
    return this.hashRefreshToken(token);
  }

  isWellFormedActionToken(token: string): boolean {
    return REFRESH_TOKEN_SHAPE.test(token);
  }

  isWellFormedRefreshToken(token: string): boolean {
    return REFRESH_TOKEN_SHAPE.test(token);
  }

  /** Throttle key: an HMAC of the normalized email, so unknown emails are throttled without being stored. */
  throttleKey(normalizedEmail: string): string {
    return createHmac('sha256', this.config.get('AUTH_THROTTLE_PEPPER', { infer: true }))
      .update(normalizedEmail)
      .digest('hex');
  }
}
