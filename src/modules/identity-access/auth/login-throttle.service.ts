import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { LoginTemporarilyBlockedError } from './auth.errors';
import { SessionRepo } from './session.repo';

/**
 * The failed-attempt counter behind sign-in and behind changing a password (T-6): one counter per
 * email, so a wrong current password counts exactly like a wrong sign-in password and cannot be used
 * to guess around it. Never locks an account; it only makes the caller wait.
 */
@Injectable()
export class LoginThrottle {
  constructor(
    private readonly sessions: SessionRepo,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Throws LoginTemporarilyBlockedError while this email is blocked. */
  async assertNotBlocked(organizationId: string, emailKeyHash: string): Promise<void> {
    const throttle = await this.sessions.findThrottle(organizationId, emailKeyHash);
    const now = new Date();
    if (throttle?.blockedUntil && throttle.blockedUntil > now) {
      throw new LoginTemporarilyBlockedError(Math.ceil((throttle.blockedUntil.getTime() - now.getTime()) / 1000));
    }
  }

  /**
   * Counts one failure in a single atomic statement, so simultaneous wrong guesses are all counted (R-06).
   * Call it only after the check has finished and failed.
   */
  async recordFailure(organizationId: string, emailKeyHash: string): Promise<void> {
    const now = new Date();
    const windowMs = this.config.get('AUTH_LOGIN_WINDOW_SECONDS', { infer: true }) * 1000;
    const blockMs = this.config.get('AUTH_LOGIN_BLOCK_SECONDS', { infer: true }) * 1000;

    await this.sessions.recordLoginFailure({
      organizationId,
      emailKeyHash,
      now,
      windowCutoff: new Date(now.getTime() - windowMs),
      maxFailures: this.config.get('AUTH_LOGIN_MAX_FAILURES', { infer: true }),
      blockedUntil: new Date(now.getTime() + blockMs),
    });
  }
}
