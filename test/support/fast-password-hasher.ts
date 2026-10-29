import { hash } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';
import { PasswordHasher } from '../../src/modules/identity-access/accounts/password-hasher.service';
import { canonicalizePassword } from '../../src/modules/identity-access/accounts/password.policy';

/*
 * OD-T3: integration suites outside identity-access sign people in to build their fixtures, and each production
 * Argon2id hash (m=19 MiB, t=2) costs tens of milliseconds of CPU. This stand-in hashes with the smallest parameters
 * Argon2id accepts; verification is the production code, which reads the parameters from the stored hash.
 * The identity-access suites and the unit spec of PasswordHasher keep the production parameters.
 */
const ARGON2ID = 2 as Algorithm;
const CHEAP = { algorithm: ARGON2ID, memoryCost: 8, timeCost: 1, parallelism: 1 } as const;

export class FastPasswordHasher extends PasswordHasher {
  private cheapDummy: Promise<string> | undefined;

  override hash(password: string): Promise<string> {
    return hash(canonicalizePassword(password), CHEAP);
  }

  override async verifyAgainstDummy(password: string): Promise<false> {
    this.cheapDummy ??= hash('placeholder-credential-that-matches-nobody', CHEAP);
    await this.verify(await this.cheapDummy, password);
    return false;
  }
}

/** Set per spec file by test/config/integration-setup.cjs: 'production' under test/integration/identity-access/. */
export function defaultPasswordHasher(): 'fast' | 'production' {
  return process.env.TEST_PASSWORD_HASHER === 'fast' ? 'fast' : 'production';
}
