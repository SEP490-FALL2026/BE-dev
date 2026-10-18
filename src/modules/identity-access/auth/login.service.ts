import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { DbTx, TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import { employeeHasNotLeft } from '../accounts/account-policy';
import { AccountRepo } from '../accounts/account.repo';
import { InvalidCredentialsError } from '../errors/identity-access.errors';
import { AccountSnapshot, IssuedSession } from '../identity-access.types';
import { LoginThrottle } from './login-throttle.service';
import { PasswordHasher } from './password-hasher.service';
import { SessionRepo } from './session.repo';
import { TokenService } from './token.service';

@Injectable()
export class LoginService {
  constructor(
    private readonly accounts: AccountRepo,
    private readonly sessions: SessionRepo,
    private readonly organization: OrganizationService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly throttle: LoginThrottle,
    private readonly runner: TransactionRunner,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

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

    await this.throttle.assertNotBlocked(organization.id, keyHash);

    // Everything CPU-heavy happens before the transaction (lock protocol rule 3).
    const account = await this.accounts.findAccountByLoginEmail(organization.id, normalized);
    const verifiedHash = await this.verifyPassword(account, password);
    const employee = account ? await this.organization.getEmployee(account.employeeId) : null;
    const usable =
      verifiedHash !== null &&
      account !== null &&
      account.status === 'ACTIVE' &&
      account.activationState === 'ACTIVATED' &&
      employeeHasNotLeft(employee);

    if (!usable) {
      // Only a wrong attempt is a failure. An attempt still being checked, or one that succeeds, is
      // not counted (R-06): the counter is raised here, after the check, in one atomic statement so
      // simultaneous wrong guesses are all counted.
      await this.throttle.recordFailure(organization.id, keyHash);
      throw new InvalidCredentialsError();
    }

    const result = await this.runner.run(async (tx) => {
      // AppUser FOR SHARE first: a lock or password change that committed earlier is now visible.
      if (!(await this.accounts.lockAppUser(tx, account.id, 'SHARE'))) return null;

      const current = await this.accounts.readAccount(tx, account.id);
      const employeeNow = await this.organization.getEmployee(account.employeeId, tx);
      const unchanged =
        current !== null &&
        current.status === 'ACTIVE' &&
        current.activationState === 'ACTIVATED' &&
        current.credentialHash === verifiedHash &&
        employeeHasNotLeft(employeeNow);
      if (!unchanged) return null;

      const session = await this.openSession(tx, account.id);
      await this.sessions.clearThrottle(tx, organization.id, keyHash);

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

  /** An unparseable email still goes through throttling and the dummy hash, under its raw form. */
  private safeNormalize(email: string): string {
    try {
      return normalizeEmail(email);
    } catch (error) {
      if (error instanceof InvalidEmailError) return `invalid:${email.trim().toLowerCase()}`;
      throw error;
    }
  }

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

  private minDate(a: Date, b: Date): Date {
    return a <= b ? a : b;
  }

  /** Database trouble from the unlocked reads (outside the runner) becomes the same transient error. */
  private asTransient(error: unknown): unknown {
    return toTransientError(error) ?? error;
  }
}
