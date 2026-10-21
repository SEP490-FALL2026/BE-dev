import { EnvironmentValidationError, validateEnvironment, validateInstallationEnvironment } from './env-schema';

/**
 * The environment matrix of the API, the worker and the recovery command (`validateEnvironment`) and of the
 * installation command (`validateInstallationEnvironment`), by NODE_ENV: which secrets get a public fallback, which
 * settings must be supplied, and which values production refuses. Names only; no value here is a real secret.
 */

/** The names the validator reports as missing for this input, or [] when it accepts it. */
function missing(input: Record<string, string>): string[] {
  try {
    validateEnvironment(input);
  } catch (error) {
    if (!(error instanceof EnvironmentValidationError)) throw error;

    return [...error.message.matchAll(/"([A-Z][A-Z0-9_]*)" is required/g)].map((match) => match[1]).sort();
  }

  return [];
}

const SECRETS = [
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_THROTTLE_PEPPER',
  'OUTBOX_PAYLOAD_KEY',
  'OUTBOX_PAYLOAD_KEY_ID',
  'LICENSE_KEY_VAULT_KEY',
  'LICENSE_KEY_VAULT_KEY_ID',
  'LICENSE_KEY_FINGERPRINT_PEPPER',
];

/** Made-up values for this spec: long enough, of the right shape, and not any public default. */
const OWN_SECRETS = {
  AUTH_ACCESS_TOKEN_SECRET: 'matrix-spec-access-token-secret-0123456789',
  AUTH_THROTTLE_PEPPER: 'matrix-spec-pepper-0123',
  OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 3).toString('base64'),
  OUTBOX_PAYLOAD_KEY_ID: 'matrix-1',
  LICENSE_KEY_VAULT_KEY: Buffer.alloc(32, 4).toString('base64'),
  LICENSE_KEY_VAULT_KEY_ID: 'matrix-vault-1',
  LICENSE_KEY_FINGERPRINT_PEPPER: 'matrix-spec-fingerprint-pepper-0123',
};

const PRODUCTION_ACTIVE = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:secret@database:5432/app',
  CORS_ORIGINS: 'https://licenses.example.com',
  ...OWN_SECRETS,
  APP_PUBLIC_URL: 'https://licenses.example.com',
  SMTP_HOST: 'smtp.example.com',
  SMTP_FROM: 'no-reply@licenses.example.com',
  SMTP_TLS: 'true',
};

const QUEUE_AND_STORAGE = {
  REDIS_HOST: 'redis.internal',
  REDIS_PASSWORD: 'matrix-redis-password',
  OBJECT_STORAGE_ENDPOINT: 'https://storage.example.com',
  OBJECT_STORAGE_BUCKET: 'matrix-bucket',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'matrix-access',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'matrix-secret',
};

describe('environment matrix by NODE_ENV (H6.3 characterization)', () => {
  it('test: every secret has a public fallback and nothing must be supplied', () => {
    const config = validateEnvironment({ NODE_ENV: 'test' });

    expect(missing({ NODE_ENV: 'test' })).toEqual([]);
    for (const key of SECRETS) expect(config[key as keyof typeof config]).toEqual(expect.any(String));
  });

  it('development (E3 = C): has no secret fallback, so it must supply exactly the seven secrets itself', () => {
    expect(missing({ NODE_ENV: 'development' })).toEqual([...SECRETS].sort());
    expect(missing({})).toEqual([...SECRETS].sort());
    expect(() => validateEnvironment({ NODE_ENV: 'development', ...OWN_SECRETS })).not.toThrow();
  });

  it.each(['development', 'production'])(
    '%s refuses every secret value that is public in the repository, one key at a time',
    (nodeEnvironment) => {
      const base = nodeEnvironment === 'production' ? PRODUCTION_ACTIVE : { NODE_ENV: 'development', ...OWN_SECRETS };
      const publicTest = validateEnvironment({ NODE_ENV: 'test' });
      const retired = {
        AUTH_ACCESS_TOKEN_SECRET: 'development-only-access-token-secret-not-for-production',
        AUTH_THROTTLE_PEPPER: 'development-only-throttle-pepper',
        OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 0x5a).toString('base64'),
      };

      const publicValues = {
        AUTH_ACCESS_TOKEN_SECRET: [publicTest.AUTH_ACCESS_TOKEN_SECRET, retired.AUTH_ACCESS_TOKEN_SECRET],
        AUTH_THROTTLE_PEPPER: [publicTest.AUTH_THROTTLE_PEPPER, retired.AUTH_THROTTLE_PEPPER],
        OUTBOX_PAYLOAD_KEY: [publicTest.OUTBOX_PAYLOAD_KEY, retired.OUTBOX_PAYLOAD_KEY],
        LICENSE_KEY_VAULT_KEY: [publicTest.LICENSE_KEY_VAULT_KEY],
        LICENSE_KEY_FINGERPRINT_PEPPER: [publicTest.LICENSE_KEY_FINGERPRINT_PEPPER],
      };

      for (const [key, values] of Object.entries(publicValues)) {
        for (const value of values) {
          expect(() => validateEnvironment({ ...base, ...QUEUE_AND_STORAGE, [key]: value })).toThrow(
            `${nodeEnvironment} must not use a value that is public in the repository for ${key}`,
          );
        }
      }
    },
  );

  it('production: requires the database, auth, mail, outbox and license key vault settings, and nothing of the queue or storage (E2 = A)', () => {
    expect(missing({ NODE_ENV: 'production' })).toEqual(
      [
        'APP_PUBLIC_URL',
        'AUTH_ACCESS_TOKEN_SECRET',
        'AUTH_THROTTLE_PEPPER',
        'DATABASE_URL',
        'LICENSE_KEY_FINGERPRINT_PEPPER',
        'LICENSE_KEY_VAULT_KEY',
        'LICENSE_KEY_VAULT_KEY_ID',
        'OUTBOX_PAYLOAD_KEY',
        'OUTBOX_PAYLOAD_KEY_ID',
        'SMTP_FROM',
        'SMTP_HOST',
      ].sort(),
    );
  });

  it('production: the validator boots on the active settings alone, without Redis or object storage keys (the storage module checks its own, ADR-0014)', () => {
    const config = validateEnvironment(PRODUCTION_ACTIVE);

    expect(Object.keys(config).filter((key) => /^(REDIS|OBJECT_STORAGE)_/.test(key))).toEqual([]);
    // Supplied anyway (an env file shared with a future deployment), they are passed through unread and unvalidated.
    expect(validateEnvironment({ ...PRODUCTION_ACTIVE, ...QUEUE_AND_STORAGE, REDIS_PORT: 'not-a-port' })).toMatchObject(
      { REDIS_PORT: 'not-a-port', REDIS_HOST: 'redis.internal' },
    );
  });

  it.each<[string, Record<string, string>, string]>([
    ['SMTP without TLS', { SMTP_TLS: 'false' }, 'SMTP_TLS'],
    ['an HTTP public URL', { APP_PUBLIC_URL: 'http://licenses.example.com' }, 'APP_PUBLIC_URL'],
    ['a wildcard CORS origin', { CORS_ORIGINS: '*' }, 'CORS_ORIGINS'],
  ])('production refuses %s', (_name, override, message) => {
    expect(() => validateEnvironment({ ...PRODUCTION_ACTIVE, ...QUEUE_AND_STORAGE, ...override })).toThrow(message);
  });

  it('installation: only the database settings, whatever NODE_ENV, and no secret is read', () => {
    expect(() => validateInstallationEnvironment({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => validateInstallationEnvironment({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => validateInstallationEnvironment({ NODE_ENV: 'production' })).toThrow('"DATABASE_URL" is required');
    expect(
      Object.keys(
        validateInstallationEnvironment({ NODE_ENV: 'production', DATABASE_URL: PRODUCTION_ACTIVE.DATABASE_URL }),
      ),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/SECRET|PEPPER|OUTBOX|SMTP|REDIS|OBJECT_STORAGE/)]));
  });

  it('never puts a secret value in a validation error message', () => {
    let message = '';
    try {
      validateEnvironment({ ...PRODUCTION_ACTIVE, ...QUEUE_AND_STORAGE, AUTH_THROTTLE_PEPPER: 'short' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('AUTH_THROTTLE_PEPPER');
    for (const value of [...Object.values(OWN_SECRETS), QUEUE_AND_STORAGE.REDIS_PASSWORD]) {
      expect(message).not.toContain(value);
    }
  });
});
