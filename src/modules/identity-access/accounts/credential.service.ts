import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PasswordPolicyError } from '../identity-access.errors';
import { CredentialRepo } from './credential.repo';
import { PASSWORD_HASH_POLICY_VERSION, PasswordHasher } from './password-hasher.service';
import { PasswordPolicyViolation, checkPasswordPolicy } from './password.policy';

/**
 * The password of an account (PasswordCredential): the policy a new one must meet, hashing and verifying, and storing
 * the hash. Hashing is the slow part: callers do it before they open a transaction (lock protocol rule 3). Neither a
 * password nor a hash ever leaves this service in a log or an error.
 */
@Injectable()
export class CredentialService {
  constructor(
    private readonly credentials: CredentialRepo,
    private readonly hasher: PasswordHasher,
  ) {}

  /** The violation of the length-based policy, or null when the password is acceptable. */
  checkPasswordPolicy(password: string, loginEmail: string): PasswordPolicyViolation | null {
    return checkPasswordPolicy(password, loginEmail);
  }

  /** Checks the policy and hashes the password; throws PasswordPolicyError. Call it before any transaction. */
  async prepareCredential(password: string, loginEmail: string): Promise<{ hash: string; hashPolicyVersion: number }> {
    const violation = checkPasswordPolicy(password, loginEmail);
    if (violation) throw new PasswordPolicyError(violation);

    return { hash: await this.hasher.hash(password), hashPolicyVersion: PASSWORD_HASH_POLICY_VERSION };
  }

  hash(password: string): Promise<string> {
    return this.hasher.hash(password);
  }

  /** False for any mismatch or malformed hash; never throws for a bad password. */
  verify(storedHash: string, password: string): Promise<boolean> {
    return this.hasher.verify(storedHash, password);
  }

  /** Burns the same CPU as a real check, so a missing credential takes as long as a wrong password. */
  verifyAgainstDummy(password: string): Promise<false> {
    return this.hasher.verifyAgainstDummy(password);
  }

  /** The first password of an account; `hashPolicyVersion` is the version the hash was made with. */
  createCredential(
    tx: DbTx,
    appUserId: string,
    hash: string,
    hashPolicyVersion: number = PASSWORD_HASH_POLICY_VERSION,
  ): Promise<void> {
    return this.credentials.createCredential(tx, appUserId, hash, hashPolicyVersion);
  }

  /** Replaces an activated account's password hash, made with the current policy version. */
  replaceCredential(tx: DbTx, appUserId: string, hash: string, now: Date): Promise<void> {
    return this.credentials.replaceCredential(tx, appUserId, hash, PASSWORD_HASH_POLICY_VERSION, now);
  }
}
