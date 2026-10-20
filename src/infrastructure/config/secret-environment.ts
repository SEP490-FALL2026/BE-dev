import Joi from 'joi';
import { EnvironmentValidationError } from './environment-validation';

/**
 * Owner decision E3 = C (H4.0 audit, 09B): only NODE_ENV=test gets a public fallback for the secrets. Development and
 * production must supply their own values (development from `.env`), and neither may use a value that is public in
 * this repository: the test fallbacks below or the development fallbacks of earlier revisions. The key id of the outbox
 * and vault key ids follow their keys: a fallback in test, supplied everywhere else. Values never appear in an error message.
 */

export interface SecretEnvironmentVariables {
  AUTH_ACCESS_TOKEN_SECRET: string;
  AUTH_THROTTLE_PEPPER: string;
  /** AES-256-GCM key for outbox payloads: base64 of 32 bytes. */
  OUTBOX_PAYLOAD_KEY: string;
  OUTBOX_PAYLOAD_KEY_ID: string;
  /** AES-256-GCM key for license keys at rest (QĐ-54b): base64 of 32 bytes. */
  LICENSE_KEY_VAULT_KEY: string;
  LICENSE_KEY_VAULT_KEY_ID: string;
  /** The stable secret of the license key fingerprints; it never rotates with the vault key. */
  LICENSE_KEY_FINGERPRINT_PEPPER: string;
}

/** Public on purpose and usable only by the test runs (unit, e2e, integration) of this repository. */
const TEST_FALLBACKS: SecretEnvironmentVariables = {
  AUTH_ACCESS_TOKEN_SECRET: 'test-only-access-token-secret-public-in-the-repository',
  AUTH_THROTTLE_PEPPER: 'test-only-throttle-pepper-public',
  OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 0x5a).toString('base64'),
  OUTBOX_PAYLOAD_KEY_ID: 'test',
  LICENSE_KEY_VAULT_KEY: Buffer.alloc(32, 0x6b).toString('base64'),
  LICENSE_KEY_VAULT_KEY_ID: 'test',
  LICENSE_KEY_FINGERPRINT_PEPPER: 'test-only-license-key-fingerprint-pepper-public',
};

/** Development fallbacks of revisions before H6.3: still public in the Git history, so never acceptable again. */
const RETIRED_DEVELOPMENT_FALLBACKS: Pick<
  SecretEnvironmentVariables,
  'AUTH_ACCESS_TOKEN_SECRET' | 'AUTH_THROTTLE_PEPPER' | 'OUTBOX_PAYLOAD_KEY'
> = {
  AUTH_ACCESS_TOKEN_SECRET: 'development-only-access-token-secret-not-for-production',
  AUTH_THROTTLE_PEPPER: 'development-only-throttle-pepper',
  OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 0x5a).toString('base64'),
};

/** The secret keys whose value must be secret: the key id is an identifier and is not compared. */
const SECRET_VALUE_KEYS = [
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_THROTTLE_PEPPER',
  'OUTBOX_PAYLOAD_KEY',
  'LICENSE_KEY_VAULT_KEY',
  'LICENSE_KEY_FINGERPRINT_PEPPER',
] as const;

const PUBLIC_VALUES: Readonly<Record<(typeof SECRET_VALUE_KEYS)[number], ReadonlySet<string>>> = {
  AUTH_ACCESS_TOKEN_SECRET: new Set([
    TEST_FALLBACKS.AUTH_ACCESS_TOKEN_SECRET,
    RETIRED_DEVELOPMENT_FALLBACKS.AUTH_ACCESS_TOKEN_SECRET,
  ]),
  AUTH_THROTTLE_PEPPER: new Set([
    TEST_FALLBACKS.AUTH_THROTTLE_PEPPER,
    RETIRED_DEVELOPMENT_FALLBACKS.AUTH_THROTTLE_PEPPER,
  ]),
  OUTBOX_PAYLOAD_KEY: new Set([TEST_FALLBACKS.OUTBOX_PAYLOAD_KEY, RETIRED_DEVELOPMENT_FALLBACKS.OUTBOX_PAYLOAD_KEY]),
  LICENSE_KEY_VAULT_KEY: new Set([TEST_FALLBACKS.LICENSE_KEY_VAULT_KEY]),
  LICENSE_KEY_FINGERPRINT_PEPPER: new Set([TEST_FALLBACKS.LICENSE_KEY_FINGERPRINT_PEPPER]),
};

/** A fallback for NODE_ENV=test only; required in development and production. */
function testOnlyFallback(schema: Joi.StringSchema, fallback: string): Joi.StringSchema {
  return schema.when('NODE_ENV', { is: 'test', then: Joi.string().default(fallback), otherwise: Joi.required() });
}

export const secretKeys = {
  AUTH_ACCESS_TOKEN_SECRET: testOnlyFallback(Joi.string().min(32), TEST_FALLBACKS.AUTH_ACCESS_TOKEN_SECRET),
  AUTH_THROTTLE_PEPPER: testOnlyFallback(Joi.string().min(16), TEST_FALLBACKS.AUTH_THROTTLE_PEPPER),
  OUTBOX_PAYLOAD_KEY: testOnlyFallback(Joi.string(), TEST_FALLBACKS.OUTBOX_PAYLOAD_KEY),
  OUTBOX_PAYLOAD_KEY_ID: testOnlyFallback(
    Joi.string().pattern(/^[A-Za-z0-9._-]{1,32}$/),
    TEST_FALLBACKS.OUTBOX_PAYLOAD_KEY_ID,
  ),
  LICENSE_KEY_VAULT_KEY: testOnlyFallback(Joi.string(), TEST_FALLBACKS.LICENSE_KEY_VAULT_KEY),
  LICENSE_KEY_VAULT_KEY_ID: testOnlyFallback(
    Joi.string().pattern(/^[A-Za-z0-9._-]{1,32}$/),
    TEST_FALLBACKS.LICENSE_KEY_VAULT_KEY_ID,
  ),
  LICENSE_KEY_FINGERPRINT_PEPPER: testOnlyFallback(Joi.string().min(16), TEST_FALLBACKS.LICENSE_KEY_FINGERPRINT_PEPPER),
};

/** Rejects a malformed outbox or vault key everywhere, and any public secret value outside NODE_ENV=test. */
export function assertSecrets(result: SecretEnvironmentVariables & { NODE_ENV: string }): void {
  for (const key of ['OUTBOX_PAYLOAD_KEY', 'LICENSE_KEY_VAULT_KEY'] as const) {
    if (Buffer.from(result[key], 'base64').length !== 32) {
      throw new EnvironmentValidationError(`Environment validation failed: ${key} must be 32 bytes encoded as base64`);
    }
  }

  if (result.NODE_ENV === 'test') return;

  const reused = SECRET_VALUE_KEYS.filter((key) => PUBLIC_VALUES[key].has(result[key]));
  if (reused.length > 0) {
    throw new EnvironmentValidationError(
      `Environment validation failed: ${result.NODE_ENV} must not use a value that is public in the repository for ` +
        `${reused.join(', ')}; generate your own (see .env.example)`,
    );
  }
}
