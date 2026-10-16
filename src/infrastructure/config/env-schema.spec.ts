import {
  EnvironmentValidationError,
  resolveDatabaseUrl,
  validateEnvironment,
  validateInstallationEnvironment,
} from './env-schema';
import { installationEnvironmentConfigOptions } from './env-config';

describe('validateEnvironment', () => {
  const productionInfrastructure = {
    CORS_ORIGINS: 'https://licenses.example.com',
    DATABASE_URL: 'postgresql://app:secret@database:5432/app',
    OBJECT_STORAGE_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    OBJECT_STORAGE_BUCKET: 'software-license-files',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    REDIS_HOST: 'redis.internal',
    REDIS_PASSWORD: 'redis-secret-password',
    AUTH_ACCESS_TOKEN_SECRET: 'production-access-token-secret-with-enough-entropy',
    AUTH_THROTTLE_PEPPER: 'production-throttle-pepper',
    APP_PUBLIC_URL: 'https://licenses.example.com',
    OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 7).toString('base64'),
    OUTBOX_PAYLOAD_KEY_ID: 'prod-1',
    SMTP_HOST: 'smtp.example.com',
    SMTP_FROM: 'no-reply@licenses.example.com',
    SMTP_TLS: 'true',
  };

  it('applies safe development defaults', () => {
    const config = validateEnvironment({});

    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      API_PREFIX: 'api',
      SWAGGER_ENABLED: true,
    });
  });

  it('defaults the database timeouts to lock 3 s < statement 5 s < transaction 10 s', () => {
    expect(validateEnvironment({})).toMatchObject({
      DB_LOCK_TIMEOUT_MS: 3000,
      DB_STATEMENT_TIMEOUT_MS: 5000,
      DB_TRANSACTION_TIMEOUT_MS: 10000,
      DB_TRANSACTION_MAX_WAIT_MS: 2000,
    });
  });

  it('defaults the client-side limits so PostgreSQL reports a slow statement before the driver gives up', () => {
    expect(validateEnvironment({})).toMatchObject({
      DB_CONNECT_TIMEOUT_MS: 3000,
      DB_QUERY_TIMEOUT_MS: 8000,
    });
  });

  it('rejects a driver query limit that would cut off a statement PostgreSQL is still allowed to run', () => {
    expect(() => validateEnvironment({ DB_QUERY_TIMEOUT_MS: '5000', DB_STATEMENT_TIMEOUT_MS: '5000' })).toThrow(
      'DB_QUERY_TIMEOUT_MS',
    );
  });

  it('rejects database timeouts that let Prisma close a transaction before PostgreSQL stops the statement', () => {
    expect(() => validateEnvironment({ DB_STATEMENT_TIMEOUT_MS: '9000', DB_TRANSACTION_TIMEOUT_MS: '9000' })).toThrow(
      'DB_STATEMENT_TIMEOUT_MS',
    );
    expect(() => validateEnvironment({ DB_LOCK_TIMEOUT_MS: '6000', DB_STATEMENT_TIMEOUT_MS: '5000' })).toThrow(
      'DB_LOCK_TIMEOUT_MS',
    );
  });

  it('requires explicit auth secrets in production and rejects the development defaults', () => {
    const { AUTH_ACCESS_TOKEN_SECRET: _secret, ...withoutSecret } = productionInfrastructure;
    void _secret;
    expect(() => validateEnvironment({ NODE_ENV: 'production', ...withoutSecret })).toThrow('AUTH_ACCESS_TOKEN_SECRET');
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        ...productionInfrastructure,
        AUTH_ACCESS_TOKEN_SECRET: 'development-only-access-token-secret-not-for-production',
      }),
    ).toThrow('development auth secrets');
  });

  it('keeps the refresh cookie Secure everywhere except development', () => {
    expect(validateEnvironment({}).AUTH_COOKIE_SECURE).toBe(false);
    expect(validateEnvironment({ NODE_ENV: 'test' }).AUTH_COOKIE_SECURE).toBe(true);
    expect(validateEnvironment({ NODE_ENV: 'production', ...productionInfrastructure }).AUTH_COOKIE_SECURE).toBe(true);
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', ...productionInfrastructure, AUTH_COOKIE_SECURE: 'false' }),
    ).toThrow('AUTH_COOKIE_SECURE');
  });

  it('rejects an idle session limit longer than the absolute limit', () => {
    expect(() =>
      validateEnvironment({ AUTH_SESSION_IDLE_SECONDS: '9000', AUTH_SESSION_ABSOLUTE_SECONDS: '3600' }),
    ).toThrow('AUTH_SESSION_IDLE_SECONDS');
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnvironment({ PORT: 'not-a-port' })).toThrow('Environment validation failed');
  });

  it('disables Swagger by default in production', () => {
    const config = validateEnvironment({ NODE_ENV: 'production', ...productionInfrastructure });
    expect(config.SWAGGER_ENABLED).toBe(false);
  });

  it('requires the database URL in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
  });

  it('requires object-storage credentials in production', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', DATABASE_URL: productionInfrastructure.DATABASE_URL }),
    ).toThrow('OBJECT_STORAGE');
  });

  it('requires the Redis host in production', () => {
    const { REDIS_HOST: redisHost, ...withoutRedis } = productionInfrastructure;
    void redisHost;
    expect(() => validateEnvironment({ NODE_ENV: 'production', ...withoutRedis })).toThrow('REDIS_HOST');
  });

  it('throws in production when no Redis password is configured', () => {
    const { REDIS_PASSWORD: _, ...withoutPassword } = productionInfrastructure;
    void _;
    expect(() => validateEnvironment({ NODE_ENV: 'production', ...withoutPassword })).toThrow('REDIS_PASSWORD');
  });

  it('accepts password via REDIS_PASSWORD env var in production', () => {
    const config = validateEnvironment({
      NODE_ENV: 'production',
      ...productionInfrastructure,
      REDIS_PASSWORD: 'secret-redis-password',
    });
    expect(config.REDIS_PASSWORD).toBe('secret-redis-password');
  });

  it('works without password in development', () => {
    const config = validateEnvironment({});
    expect(config.REDIS_PASSWORD).toBe('');
  });

  it('works without password in test', () => {
    const config = validateEnvironment({ NODE_ENV: 'test' });
    expect(config.REDIS_PASSWORD).toBe('');
  });

  it.each([
    '',
    '*',
    'http://licenses.example.com',
    'https://licenses.example.com/path',
    'https://user@licenses.example.com',
  ])('rejects unsafe production CORS origins: %s', (corsOrigins) => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', ...productionInfrastructure, CORS_ORIGINS: corsOrigins }),
    ).toThrow('CORS_ORIGINS');
  });

  it('requires HTTPS object storage in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        ...productionInfrastructure,
        OBJECT_STORAGE_ENDPOINT: 'http://storage.example.com',
      }),
    ).toThrow('OBJECT_STORAGE_ENDPOINT');
  });

  it('applies rate-limit defaults', () => {
    expect(validateEnvironment({})).toMatchObject({
      RATE_LIMIT_TTL_MS: 60_000,
      RATE_LIMIT_LIMIT: 120,
    });
  });

  it('rejects a rate limit below one request', () => {
    expect(() => validateEnvironment({ RATE_LIMIT_LIMIT: '0' })).toThrow('Environment validation failed');
  });
});

describe('resolveDatabaseUrl', () => {
  const DEVELOPMENT_URL = 'postgresql://app:app@localhost:5432/software_license_management';

  it('leaves development and production untouched', () => {
    expect(resolveDatabaseUrl('development', DEVELOPMENT_URL, '')).toBe(DEVELOPMENT_URL);
    expect(resolveDatabaseUrl('production', DEVELOPMENT_URL, '')).toBe(DEVELOPMENT_URL);
  });

  it('gives the test environment its own database', () => {
    expect(resolveDatabaseUrl('test', DEVELOPMENT_URL, '')).toBe(`${DEVELOPMENT_URL}_test`);
  });

  it('tolerates a trailing slash on the source url', () => {
    expect(resolveDatabaseUrl('test', `${DEVELOPMENT_URL}/`, '')).toBe(`${DEVELOPMENT_URL}_test`);
  });

  it('prefers an explicit test url when one is set', () => {
    const explicit = 'postgresql://app:app@localhost:5432/custom_test_db';

    expect(resolveDatabaseUrl('test', DEVELOPMENT_URL, explicit)).toBe(explicit);
  });
});

describe('DATABASE_URL resolution through validateEnvironment', () => {
  // Resolving inside validateEnvironment is what makes every consumer agree. If it were
  // resolved at one consumer instead, the Prisma CLI and any integration harness would
  // still read the development database while the application read the test one.
  it('hands every consumer the test database when NODE_ENV is test', () => {
    const development = validateEnvironment({}).DATABASE_URL;
    const test = validateEnvironment({ NODE_ENV: 'test' }).DATABASE_URL;

    expect(test).not.toBe(development);
    expect(test).toBe(`${development}_test`);
  });

  it('honours an explicit TEST_DATABASE_URL', () => {
    const explicit = 'postgresql://app:app@localhost:5432/custom_test_db';

    expect(validateEnvironment({ NODE_ENV: 'test', TEST_DATABASE_URL: explicit }).DATABASE_URL).toBe(explicit);
  });

  it('rejects TEST_DATABASE_URL outside the test environment', () => {
    expect(() => validateEnvironment({ TEST_DATABASE_URL: 'postgresql://app:app@localhost:5432/x' })).toThrow(
      'TEST_DATABASE_URL',
    );
  });
});

describe('invitation email configuration', () => {
  const productionBase = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://licenses.example.com',
    DATABASE_URL: 'postgresql://app:secret@database:5432/app',
    OBJECT_STORAGE_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    OBJECT_STORAGE_BUCKET: 'software-license-files',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    REDIS_HOST: 'redis.internal',
    REDIS_PASSWORD: 'redis-secret-password',
    AUTH_ACCESS_TOKEN_SECRET: 'production-access-token-secret-with-enough-entropy',
    AUTH_THROTTLE_PEPPER: 'production-throttle-pepper',
    APP_PUBLIC_URL: 'https://licenses.example.com',
    OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 7).toString('base64'),
    OUTBOX_PAYLOAD_KEY_ID: 'prod-1',
    SMTP_HOST: 'smtp.example.com',
    SMTP_FROM: 'no-reply@licenses.example.com',
    SMTP_TLS: 'true',
  };

  it('defaults the invitation lifetime to 72 hours and polls the outbox every 3 seconds', () => {
    expect(validateEnvironment({})).toMatchObject({
      AUTH_INVITATION_TTL_SECONDS: 259_200,
      OUTBOX_POLL_INTERVAL_MS: 3_000,
    });
  });

  describe('password reset settings (T-1, T-2)', () => {
    it('defaults the reset link to 30 minutes and three requests per hour', () => {
      expect(validateEnvironment({})).toMatchObject({
        AUTH_PASSWORD_RESET_TTL_SECONDS: 1_800,
        AUTH_PASSWORD_RESET_MAX_PER_HOUR: 3,
      });
    });

    it('reads both from the environment', () => {
      expect(
        validateEnvironment({ AUTH_PASSWORD_RESET_TTL_SECONDS: '600', AUTH_PASSWORD_RESET_MAX_PER_HOUR: '5' }),
      ).toMatchObject({ AUTH_PASSWORD_RESET_TTL_SECONDS: 600, AUTH_PASSWORD_RESET_MAX_PER_HOUR: 5 });
    });

    it.each([
      ['a link that lives under 5 minutes', { AUTH_PASSWORD_RESET_TTL_SECONDS: '299' }],
      ['a link that lives over 24 hours', { AUTH_PASSWORD_RESET_TTL_SECONDS: '86401' }],
      ['no request allowed per hour', { AUTH_PASSWORD_RESET_MAX_PER_HOUR: '0' }],
      ['an unbounded number of requests per hour', { AUTH_PASSWORD_RESET_MAX_PER_HOUR: '101' }],
      ['a fractional limit', { AUTH_PASSWORD_RESET_MAX_PER_HOUR: '2.5' }],
    ])('rejects %s', (_name, env) => {
      expect(() => validateEnvironment(env)).toThrow(/AUTH_PASSWORD_RESET/);
    });
  });

  it('runs in development without any mail or outbox setting', () => {
    const config = validateEnvironment({});

    expect(config.OUTBOX_PAYLOAD_KEY_ID).toBe('development');
    expect(Buffer.from(config.OUTBOX_PAYLOAD_KEY, 'base64')).toHaveLength(32);
  });

  it('accepts a complete production mail setup', () => {
    expect(() => validateEnvironment(productionBase)).not.toThrow();
  });

  it.each(['APP_PUBLIC_URL', 'OUTBOX_PAYLOAD_KEY', 'OUTBOX_PAYLOAD_KEY_ID', 'SMTP_HOST', 'SMTP_FROM'])(
    'requires %s in production',
    (key) => {
      const rest = Object.fromEntries(Object.entries(productionBase).filter(([name]) => name !== key));

      expect(() => validateEnvironment(rest)).toThrow(key);
    },
  );

  it('rejects the development payload key in production', () => {
    const development = validateEnvironment({}).OUTBOX_PAYLOAD_KEY;

    expect(() => validateEnvironment({ ...productionBase, OUTBOX_PAYLOAD_KEY: development })).toThrow('development');
  });

  it('rejects a payload key that is not 32 bytes of base64', () => {
    expect(() => validateEnvironment({ OUTBOX_PAYLOAD_KEY: Buffer.from('short').toString('base64') })).toThrow(
      '32 bytes',
    );
  });

  it('requires an HTTPS public URL in production', () => {
    expect(() => validateEnvironment({ ...productionBase, APP_PUBLIC_URL: 'http://licenses.example.com' })).toThrow(
      'APP_PUBLIC_URL',
    );
  });

  it('requires TLS for SMTP in production, because the mail carries a bearer activation link', () => {
    expect(() => validateEnvironment({ ...productionBase, SMTP_TLS: 'false' })).toThrow('SMTP_TLS');
    expect(() => validateEnvironment({ ...productionBase, SMTP_TLS: undefined })).toThrow('SMTP_TLS');
  });
});

describe('installation environment (database keys only)', () => {
  const minimal = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db:5432/x' };
  const fullProduction = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://licenses.example.com',
    DATABASE_URL: 'postgresql://app:secret@database:5432/app',
    OBJECT_STORAGE_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    OBJECT_STORAGE_BUCKET: 'software-license-files',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    REDIS_HOST: 'redis.internal',
    REDIS_PASSWORD: 'redis-secret-password',
    AUTH_ACCESS_TOKEN_SECRET: 'production-access-token-secret-with-enough-entropy',
    AUTH_THROTTLE_PEPPER: 'production-throttle-pepper',
    APP_PUBLIC_URL: 'https://licenses.example.com',
    OUTBOX_PAYLOAD_KEY: Buffer.alloc(32, 7).toString('base64'),
    OUTBOX_PAYLOAD_KEY_ID: 'prod-1',
    SMTP_HOST: 'smtp.example.com',
    SMTP_FROM: 'no-reply@licenses.example.com',
    SMTP_TLS: 'true',
  };

  it('validates the installation config options with the installation validator (R-13)', () => {
    expect(() => installationEnvironmentConfigOptions.validate(minimal)).not.toThrow();
    expect(installationEnvironmentConfigOptions.validate(minimal)).toEqual(validateInstallationEnvironment(minimal));
  });

  it('accepts only NODE_ENV and DATABASE_URL in production and applies the database defaults', () => {
    expect(validateInstallationEnvironment(minimal)).toEqual({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@db:5432/x',
      TEST_DATABASE_URL: '',
      DB_LOCK_TIMEOUT_MS: 3000,
      DB_STATEMENT_TIMEOUT_MS: 5000,
      DB_TRANSACTION_TIMEOUT_MS: 10000,
      DB_TRANSACTION_MAX_WAIT_MS: 2000,
      DB_CONNECT_TIMEOUT_MS: 3000,
      DB_QUERY_TIMEOUT_MS: 8000,
      DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: 20000,
    });
  });

  it('still requires DATABASE_URL in production', () => {
    expect(() => validateInstallationEnvironment({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
  });

  it('rejects a DATABASE_URL that is not PostgreSQL', () => {
    expect(() =>
      validateInstallationEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'mysql://u:p@db:3306/x' }),
    ).toThrow('DATABASE_URL');
  });

  it('rejects TEST_DATABASE_URL outside the test environment', () => {
    expect(() =>
      validateInstallationEnvironment({ ...minimal, TEST_DATABASE_URL: 'postgresql://u:p@db:5432/x_test' }),
    ).toThrow('TEST_DATABASE_URL');
  });

  it('resolves the test database like the full validator does', () => {
    const explicit = 'postgresql://app:app@localhost:5432/custom_test_db';

    expect(validateInstallationEnvironment({ NODE_ENV: 'test', TEST_DATABASE_URL: explicit }).DATABASE_URL).toBe(
      explicit,
    );
    expect(validateInstallationEnvironment({ NODE_ENV: 'test' }).DATABASE_URL).toBe(
      validateEnvironment({ NODE_ENV: 'test' }).DATABASE_URL,
    );
  });

  it('enforces the same database timeout ordering as the full validator', () => {
    expect(() => validateInstallationEnvironment({ ...minimal, DB_LOCK_TIMEOUT_MS: '6000' })).toThrow(
      'DB_LOCK_TIMEOUT_MS',
    );
    expect(() =>
      validateInstallationEnvironment({
        ...minimal,
        DB_STATEMENT_TIMEOUT_MS: '9000',
        DB_TRANSACTION_TIMEOUT_MS: '9000',
      }),
    ).toThrow('DB_STATEMENT_TIMEOUT_MS');
    expect(() =>
      validateInstallationEnvironment({ ...minimal, DB_QUERY_TIMEOUT_MS: '5000', DB_STATEMENT_TIMEOUT_MS: '5000' }),
    ).toThrow('DB_QUERY_TIMEOUT_MS');
    expect(() =>
      validateInstallationEnvironment({
        ...minimal,
        DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '10000',
        DB_TRANSACTION_TIMEOUT_MS: '10000',
      }),
    ).toThrow('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS must be higher than DB_TRANSACTION_TIMEOUT_MS');
  });

  it('accepts the complete production environment too (an env file shared with the API still works)', () => {
    expect(() => validateInstallationEnvironment(fullProduction)).not.toThrow();
  });

  it('keeps the API and worker validator fail-closed on the same minimal environment', () => {
    let message = '';
    try {
      validateEnvironment(minimal);
    } catch (error) {
      message = (error as Error).message;
    }

    for (const key of [
      'AUTH_ACCESS_TOKEN_SECRET',
      'OUTBOX_PAYLOAD_KEY',
      'SMTP_HOST',
      'REDIS_HOST',
      'OBJECT_STORAGE_ENDPOINT',
    ]) {
      expect(message).toContain(key);
    }
  });

  it('throws a typed EnvironmentValidationError from both validators', () => {
    expect(() => validateInstallationEnvironment({ NODE_ENV: 'production' })).toThrow(EnvironmentValidationError);
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(EnvironmentValidationError);
    expect(() => validateEnvironment({ DB_LOCK_TIMEOUT_MS: '6000' })).toThrow(EnvironmentValidationError);
    expect(new EnvironmentValidationError('x')).toMatchObject({ name: 'EnvironmentValidationError' });
    expect(new EnvironmentValidationError('x')).toBeInstanceOf(Error);
  });

  describe.each([
    ['validateInstallationEnvironment', validateInstallationEnvironment],
    ['validateEnvironment', validateEnvironment],
  ] as const)('idle-in-transaction default through %s', (_name, validate) => {
    it('keeps 20 s with the default transaction timeout', () => {
      expect(validate({}).DB_IDLE_IN_TRANSACTION_TIMEOUT_MS).toBe(20000);
    });

    it('follows a longer transaction timeout instead of failing to boot after an upgrade', () => {
      expect(
        validate({
          DB_TRANSACTION_TIMEOUT_MS: '60000',
          DB_STATEMENT_TIMEOUT_MS: '30000',
          DB_QUERY_TIMEOUT_MS: '40000',
        }),
      ).toMatchObject({
        DB_TRANSACTION_TIMEOUT_MS: 60000,
        DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: 70000,
      });
    });

    it('does not reject a longer transaction timeout when no idle limit is given', () => {
      expect(() =>
        validate({
          DB_TRANSACTION_TIMEOUT_MS: '60000',
          DB_STATEMENT_TIMEOUT_MS: '30000',
          DB_QUERY_TIMEOUT_MS: '40000',
        }),
      ).not.toThrow();
    });

    it('keeps the 20 s floor when the transaction timeout is short', () => {
      expect(validate({ DB_TRANSACTION_TIMEOUT_MS: '6000' }).DB_IDLE_IN_TRANSACTION_TIMEOUT_MS).toBe(20000);
    });

    it('rejects an explicit idle limit that is not above the transaction timeout', () => {
      expect(() =>
        validate({ DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '10000', DB_TRANSACTION_TIMEOUT_MS: '10000' }),
      ).toThrow('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS must be higher than DB_TRANSACTION_TIMEOUT_MS');
    });

    it('honours an explicit idle limit above the transaction timeout', () => {
      expect(validate({ DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '15000' }).DB_IDLE_IN_TRANSACTION_TIMEOUT_MS).toBe(15000);
    });
  });
});
