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

const KEY_ID_SHAPE = /^[A-Za-z0-9._-]{1,32}$/;

/**
 * The vault keys kept to open what was sealed before a rotation, read as `id:base64` pairs. Every pair is held to what the
 * current key is held to: 32 bytes, an id of the same shape, and a key of its own (a key that was never public).
 */
function previousVaultKeys(result: { LICENSE_KEY_VAULT_KEY: string; LICENSE_KEY_VAULT_KEY_ID: string }, raw: string) {
  const fail = (reason: string): never => {
    throw new EnvironmentValidationError(`Environment validation failed: LICENSE_KEY_VAULT_PREVIOUS_KEYS ${reason}`);
  };
  const seen = new Set<string>();

  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(':');
      if (separator < 1 || separator === pair.length - 1) fail('must hold id:base64 pairs separated by commas');
      const id = pair.slice(0, separator);
      const key = pair.slice(separator + 1);
      if (!KEY_ID_SHAPE.test(id)) fail('must hold an id of letters, digits, dot, dash and underscore, up to 32');
      if (Buffer.from(key, 'base64').length !== 32) fail('must hold keys of 32 bytes encoded as base64');
      if (id === result.LICENSE_KEY_VAULT_KEY_ID) fail('must not repeat LICENSE_KEY_VAULT_KEY_ID');
      if (seen.has(id)) fail('must not repeat an id');
      if (key === result.LICENSE_KEY_VAULT_KEY) fail('must differ from LICENSE_KEY_VAULT_KEY');
      seen.add(id);

      return key;
    });
}

/** Rejects a malformed outbox or vault key everywhere, and any public secret value outside NODE_ENV=test. */
export function assertSecrets(
  result: SecretEnvironmentVariables & { NODE_ENV: string; LICENSE_KEY_VAULT_PREVIOUS_KEYS?: string },
): void {
  for (const key of ['OUTBOX_PAYLOAD_KEY', 'LICENSE_KEY_VAULT_KEY'] as const) {
    if (Buffer.from(result[key], 'base64').length !== 32) {
      throw new EnvironmentValidationError(`Environment validation failed: ${key} must be 32 bytes encoded as base64`);
    }
  }
  // One key seals one kind of thing: a leak of the outbox key must not open the license keys.
  if (result.LICENSE_KEY_VAULT_KEY === result.OUTBOX_PAYLOAD_KEY) {
    throw new EnvironmentValidationError(
      'Environment validation failed: LICENSE_KEY_VAULT_KEY must differ from OUTBOX_PAYLOAD_KEY',
    );
  }
  const previous = previousVaultKeys(result, result.LICENSE_KEY_VAULT_PREVIOUS_KEYS ?? '');

  if (result.NODE_ENV === 'test') return;

  const reused: string[] = SECRET_VALUE_KEYS.filter((key) => PUBLIC_VALUES[key].has(result[key]));
  if (previous.some((key) => PUBLIC_VALUES.LICENSE_KEY_VAULT_KEY.has(key)))
    reused.push('LICENSE_KEY_VAULT_PREVIOUS_KEYS');
  if (reused.length > 0) {
    throw new EnvironmentValidationError(
      `Environment validation failed: ${result.NODE_ENV} must not use a value that is public in the repository for ` +
        `${reused.join(', ')}; generate your own (see .env.example)`,
    );
  }
}
