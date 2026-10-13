import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';
import { canonicalizePassword } from './password.policy';

/** Bumped whenever the parameters below change, so old hashes can be found and upgraded at login. */
export const PASSWORD_HASH_POLICY_VERSION = 1;

/**
 * `Algorithm` is a `declare const enum` in the package typings, which is not safe to reference
 * by name under isolated compilation; 2 is Argon2id.
 */
const ARGON2ID = 2 as Algorithm;

// OWASP minimum for Argon2id: m=19 MiB, t=2, p=1. Stated explicitly rather than left to defaults.
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(canonicalizePassword(password), OPTIONS);
  }

  /** False for any mismatch or malformed hash; never throws for a bad password. */
  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, canonicalizePassword(password));
    } catch {
      return false;
    }
  }

  /**
   * Burns the same CPU as a real check so an unknown email takes about as long as a wrong
   * password. The hash is computed once, lazily, and never matches anything.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= hash('placeholder-credential-that-matches-nobody', OPTIONS);
    await this.verify(await this.dummyHash, password);

    return false;
  }
}
