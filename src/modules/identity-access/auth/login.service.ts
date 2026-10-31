import { Injectable } from '@nestjs/common';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { CredentialService } from '../credentials/credential.service';
import { AccountSnapshot, IssuedSession } from '../public/identity-access.types';
import { employeeHasNotLeft } from '../accounts/account.policy';
import { InvalidCredentialsError } from './auth.errors';
import { LoginThrottle } from './login-throttle.service';
import { SessionTokenService } from './session-token.service';

@Injectable()
export class LoginService {
  constructor(
    private readonly accounts: AccountDirectoryService,
    private readonly organization: OrganizationApi,
    private readonly credentials: CredentialService,
    private readonly throttle: LoginThrottle,
    private readonly sessionTokens: SessionTokenService,
    private readonly runner: TransactionRunner,
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
      await this.credentials.verifyAgainstDummy(password);
      throw new InvalidCredentialsError();
    }

    const normalized = this.safeNormalize(email);
    const keyHash = this.throttle.keyFor(normalized);

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
      // not counted: the counter is raised here, after the check, in one atomic statement so
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

      const session = await this.sessionTokens.open(tx, account.id);
      await this.throttle.clear(tx, organization.id, keyHash);

      return session;
    });

    // State changed between the check and the lock: same answer as any other failure.
    if (result === null) throw new InvalidCredentialsError();

    return result;
  }

  private async verifyPassword(account: AccountSnapshot | null, password: string): Promise<string | null> {
    if (!account?.credentialHash) {
      await this.credentials.verifyAgainstDummy(password);
      return null;
    }

    return (await this.credentials.verify(account.credentialHash, password)) ? account.credentialHash : null;
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

  /** Database trouble from the unlocked reads (outside the runner) becomes the same transient error. */
  private asTransient(error: unknown): unknown {
    return toTransientError(error) ?? error;
  }
}
