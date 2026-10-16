import Joi from 'joi';
import { parseCorsOrigins, validateProductionCorsOrigins } from './cors';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  API_PREFIX: string;
  CORS_ORIGINS: string;
  TRUST_PROXY_HOPS: number;
  RATE_LIMIT_TTL_MS: number;
  RATE_LIMIT_LIMIT: number;
  SWAGGER_ENABLED: boolean;
  DATABASE_URL: string;
  TEST_DATABASE_URL: string;
  DB_LOCK_TIMEOUT_MS: number;
  DB_STATEMENT_TIMEOUT_MS: number;
  DB_TRANSACTION_TIMEOUT_MS: number;
  DB_TRANSACTION_MAX_WAIT_MS: number;
  DB_CONNECT_TIMEOUT_MS: number;
  DB_QUERY_TIMEOUT_MS: number;
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: number;
  OBJECT_STORAGE_ENDPOINT: string;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_BUCKET: string;
  OBJECT_STORAGE_ACCESS_KEY_ID: string;
  OBJECT_STORAGE_SECRET_ACCESS_KEY: string;
  OBJECT_STORAGE_FORCE_PATH_STYLE: boolean;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_USERNAME: string;
  REDIS_PASSWORD: string;
  REDIS_TLS: boolean;
  AUTH_ACCESS_TOKEN_SECRET: string;
  AUTH_ACCESS_TOKEN_TTL_SECONDS: number;
  AUTH_SESSION_IDLE_SECONDS: number;
  AUTH_SESSION_ABSOLUTE_SECONDS: number;
  AUTH_LOGIN_MAX_FAILURES: number;
  AUTH_LOGIN_WINDOW_SECONDS: number;
  AUTH_LOGIN_BLOCK_SECONDS: number;
  AUTH_THROTTLE_PEPPER: string;
  AUTH_COOKIE_SECURE: boolean;
  AUTH_JWT_ISSUER: string;
  AUTH_JWT_AUDIENCE: string;
  AUTH_INVITATION_TTL_SECONDS: number;
  /** How long a password-reset link works (T-1). */
  AUTH_PASSWORD_RESET_TTL_SECONDS: number;
  /** Reset links one account can be issued in any 60 minutes; further requests are answered the same but issue none (T-2). */
  AUTH_PASSWORD_RESET_MAX_PER_HOUR: number;
  APP_PUBLIC_URL: string;
  OUTBOX_PAYLOAD_KEY: string;
  OUTBOX_PAYLOAD_KEY_ID: string;
  /** `id:base64` pairs separated by commas: keys that may still seal pending rows after a rotation. */
  OUTBOX_PAYLOAD_PREVIOUS_KEYS: string;
  OUTBOX_POLL_INTERVAL_MS: number;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  SMTP_FROM: string;
  SMTP_TLS: boolean;
}

/** The keys the database layer reads. The installation command validates exactly these. */
export type DatabaseEnvironmentVariables = Pick<
  EnvironmentVariables,
  | 'NODE_ENV'
  | 'DATABASE_URL'
  | 'TEST_DATABASE_URL'
  | 'DB_LOCK_TIMEOUT_MS'
  | 'DB_STATEMENT_TIMEOUT_MS'
  | 'DB_TRANSACTION_TIMEOUT_MS'
  | 'DB_TRANSACTION_MAX_WAIT_MS'
  | 'DB_CONNECT_TIMEOUT_MS'
  | 'DB_QUERY_TIMEOUT_MS'
  | 'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS'
>;

/** Thrown by every environment validator; the installation command reports it without a stack trace. */
export class EnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentValidationError';
  }
}

const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 20_000;
const IDLE_MARGIN_MS = 10_000;
const DEVELOPMENT_ACCESS_TOKEN_SECRET = 'development-only-access-token-secret-not-for-production';
const DEVELOPMENT_THROTTLE_PEPPER = 'development-only-throttle-pepper';
const DEVELOPMENT_OUTBOX_PAYLOAD_KEY = Buffer.alloc(32, 0x5a).toString('base64');
const DEVELOPMENT_OUTBOX_PAYLOAD_KEY_ID = 'development';

// Shared by the full schema (API, worker) and the installation command's schema, so the two cannot drift.
const databaseKeys = {
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default('postgresql://app:app@localhost:5432/software_license_management'),
    }),
  TEST_DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .when('NODE_ENV', {
      is: 'test',
      then: Joi.optional(),
      otherwise: Joi.forbidden(),
    })
    .default(''),
  // Per-transaction limits for the organization/identity area. The ordering lock < statement <
  // transaction makes PostgreSQL stop a slow statement (55P03/57014) before Prisma closes the
  // transaction itself (P2028); assertDatabaseLimits enforces it.
  DB_LOCK_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(3_000),
  DB_STATEMENT_TIMEOUT_MS: Joi.number().integer().min(100).max(120_000).default(5_000),
  DB_TRANSACTION_TIMEOUT_MS: Joi.number().integer().min(100).max(180_000).default(10_000),
  DB_TRANSACTION_MAX_WAIT_MS: Joi.number().integer().min(100).max(60_000).default(2_000),
  // Client-side limits for a database that accepts the connection but never answers (paused
  // container, dropped network path). The server-side timeouts above cannot fire in that case,
  // so without these a request waits forever. The query limit sits above the statement timeout
  // so PostgreSQL reports a slow statement first; assertDatabaseLimits enforces it.
  DB_CONNECT_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(3_000),
  DB_QUERY_TIMEOUT_MS: Joi.number().integer().min(100).max(180_000).default(8_000),
  // No Joi default: when absent it follows the transaction timeout (resolveDatabaseSettings), so a
  // deployment with a longer transaction timeout keeps booting.
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: Joi.number().integer().min(1_000).max(600_000),
};

const environmentSchema = Joi.object({
  ...databaseKeys,
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string()
    .pattern(/^[a-z][a-z0-9-]*$/)
    .default('api'),
  CORS_ORIGINS: Joi.string().allow('').default('http://localhost:5173'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(20).default(0),
  RATE_LIMIT_TTL_MS: Joi.number().integer().min(1_000).max(3_600_000).default(60_000),
  RATE_LIMIT_LIMIT: Joi.number().integer().min(1).max(10_000).default(120),
  SWAGGER_ENABLED: Joi.boolean(),
  OBJECT_STORAGE_ENDPOINT: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default('http://localhost:9000'),
    }),
  OBJECT_STORAGE_REGION: Joi.string().default('us-east-1'),
  OBJECT_STORAGE_BUCKET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('software-license-files'),
  }),
  OBJECT_STORAGE_ACCESS_KEY_ID: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('minioadmin'),
  }),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('minioadmin'),
  }),
  OBJECT_STORAGE_FORCE_PATH_STYLE: Joi.boolean().default(true),
  REDIS_HOST: Joi.string()
    .hostname()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default('localhost'),
    }),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_USERNAME: Joi.string().allow('').default(''),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_TLS: Joi.boolean().default(false),
  // Secrets have a default only outside production so a fresh checkout runs; production must
  // supply its own. A default is never a secret, which is why it is rejected in production below.
  AUTH_ACCESS_TOKEN_SECRET: Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default(DEVELOPMENT_ACCESS_TOKEN_SECRET),
    }),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).max(3_600).default(600),
  AUTH_SESSION_IDLE_SECONDS: Joi.number().integer().min(300).max(2_592_000).default(28_800),
  AUTH_SESSION_ABSOLUTE_SECONDS: Joi.number().integer().min(300).max(7_776_000).default(604_800),
  AUTH_LOGIN_MAX_FAILURES: Joi.number().integer().min(3).max(100).default(5),
  AUTH_LOGIN_WINDOW_SECONDS: Joi.number().integer().min(30).max(86_400).default(900),
  AUTH_LOGIN_BLOCK_SECONDS: Joi.number().integer().min(30).max(86_400).default(900),
  AUTH_THROTTLE_PEPPER: Joi.string()
    .min(16)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default(DEVELOPMENT_THROTTLE_PEPPER),
    }),
  AUTH_COOKIE_SECURE: Joi.boolean(),
  AUTH_JWT_ISSUER: Joi.string().default('slm-api'),
  AUTH_JWT_AUDIENCE: Joi.string().default('slm-web'),
  AUTH_INVITATION_TTL_SECONDS: Joi.number().integer().min(3_600).max(1_209_600).default(259_200),
  AUTH_PASSWORD_RESET_TTL_SECONDS: Joi.number().integer().min(300).max(86_400).default(1_800),
  AUTH_PASSWORD_RESET_MAX_PER_HOUR: Joi.number().integer().min(1).max(100).default(3),
  // Links in invitation mail point here; the token travels in the URL fragment.
  APP_PUBLIC_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default('http://localhost:5173'),
    }),
  // AES-256-GCM key for outbox payloads (base64 of 32 bytes). Like the auth secrets, the
  // development default is rejected in production.
  OUTBOX_PAYLOAD_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default(DEVELOPMENT_OUTBOX_PAYLOAD_KEY),
  }),
  OUTBOX_PAYLOAD_KEY_ID: Joi.string()
    .pattern(/^[A-Za-z0-9._-]{1,32}$/)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default(DEVELOPMENT_OUTBOX_PAYLOAD_KEY_ID),
    }),
  OUTBOX_PAYLOAD_PREVIOUS_KEYS: Joi.string().allow('').default(''),
  OUTBOX_POLL_INTERVAL_MS: Joi.number().integer().min(500).max(60_000).default(3_000),
  SMTP_HOST: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('localhost'),
  }),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('no-reply@localhost'),
  }),
  SMTP_TLS: Joi.boolean().default(false),
}).unknown(true);

/** The installation command needs the database and nothing else; unrelated variables are ignored. */
const installationEnvironmentSchema = Joi.object(databaseKeys).unknown(true);

function validateSchema(schema: Joi.ObjectSchema, input: Record<string, unknown>): unknown {
  const validation = schema.validate(input, {
    abortEarly: false,
    convert: true,
  }) as unknown as { error?: Error; value: unknown };

  if (validation.error) {
    throw new EnvironmentValidationError(`Environment validation failed: ${validation.error.message}`);
  }

  return validation.value;
}

/**
 * Settings that depend on other settings. Resolved here rather than at each consumer, so every
 * reader of DATABASE_URL (the Prisma client, a migration script, an integration harness) sees the
 * same database, and every reader of the idle limit sees one that already clears the transaction
 * timeout.
 */
function resolveDatabaseSettings(
  parsed: Omit<DatabaseEnvironmentVariables, 'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS'> & {
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS?: number;
  },
): DatabaseEnvironmentVariables {
  return {
    ...parsed,
    DATABASE_URL: resolveDatabaseUrl(parsed.NODE_ENV, parsed.DATABASE_URL, parsed.TEST_DATABASE_URL),
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS:
      parsed.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS ??
      Math.max(DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS, parsed.DB_TRANSACTION_TIMEOUT_MS + IDLE_MARGIN_MS),
  };
}

function assertDatabaseLimits(result: DatabaseEnvironmentVariables): void {
  if (
    result.DB_LOCK_TIMEOUT_MS > result.DB_STATEMENT_TIMEOUT_MS ||
    result.DB_STATEMENT_TIMEOUT_MS >= result.DB_TRANSACTION_TIMEOUT_MS
  ) {
    throw new EnvironmentValidationError(
      'Environment validation failed: DB_LOCK_TIMEOUT_MS must not exceed DB_STATEMENT_TIMEOUT_MS, ' +
        'and DB_STATEMENT_TIMEOUT_MS must be lower than DB_TRANSACTION_TIMEOUT_MS',
    );
  }

  if (result.DB_QUERY_TIMEOUT_MS <= result.DB_STATEMENT_TIMEOUT_MS) {
    throw new EnvironmentValidationError(
      'Environment validation failed: DB_QUERY_TIMEOUT_MS must be higher than DB_STATEMENT_TIMEOUT_MS, ' +
        'so PostgreSQL reports a slow statement before the driver gives up',
    );
  }

  if (result.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS <= result.DB_TRANSACTION_TIMEOUT_MS) {
    throw new EnvironmentValidationError(
      'Environment validation failed: DB_IDLE_IN_TRANSACTION_TIMEOUT_MS must be higher than DB_TRANSACTION_TIMEOUT_MS, ' +
        'so the server only ends sessions the application has already given up on',
    );
  }
}

/** Validates what the installation command reads: the database settings and NODE_ENV, nothing else. */
export function validateInstallationEnvironment(input: Record<string, unknown>): DatabaseEnvironmentVariables {
  const result = resolveDatabaseSettings(
    validateSchema(installationEnvironmentSchema, input) as Parameters<typeof resolveDatabaseSettings>[0],
  );
  assertDatabaseLimits(result);

  return result;
}

export function validateEnvironment(input: Record<string, unknown>): EnvironmentVariables {
  const parsed = validateSchema(environmentSchema, input) as Omit<
    EnvironmentVariables,
    'SWAGGER_ENABLED' | 'AUTH_COOKIE_SECURE' | 'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS'
  > & {
    SWAGGER_ENABLED?: boolean;
    AUTH_COOKIE_SECURE?: boolean;
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS?: number;
  };
  const result = {
    ...parsed,
    ...resolveDatabaseSettings(parsed),
    SWAGGER_ENABLED: parsed.SWAGGER_ENABLED ?? parsed.NODE_ENV !== 'production',
    AUTH_COOKIE_SECURE: parsed.AUTH_COOKIE_SECURE ?? parsed.NODE_ENV !== 'development',
  };

  assertDatabaseLimits(result);

  if (result.AUTH_SESSION_IDLE_SECONDS > result.AUTH_SESSION_ABSOLUTE_SECONDS) {
    throw new EnvironmentValidationError(
      'Environment validation failed: AUTH_SESSION_IDLE_SECONDS must not exceed AUTH_SESSION_ABSOLUTE_SECONDS',
    );
  }

  if (Buffer.from(result.OUTBOX_PAYLOAD_KEY, 'base64').length !== 32) {
    throw new EnvironmentValidationError(
      'Environment validation failed: OUTBOX_PAYLOAD_KEY must be 32 bytes encoded as base64',
    );
  }

  if (result.NODE_ENV === 'production') {
    if (result.OUTBOX_PAYLOAD_KEY === DEVELOPMENT_OUTBOX_PAYLOAD_KEY) {
      throw new EnvironmentValidationError(
        'Environment validation failed: production must not use the development outbox payload key',
      );
    }

    if (!result.SMTP_TLS) {
      throw new EnvironmentValidationError(
        'Environment validation failed: SMTP_TLS must be true in production (the mail carries a bearer activation link)',
      );
    }

    if (!isHttpsUrl(result.APP_PUBLIC_URL)) {
      throw new EnvironmentValidationError(
        'Environment validation failed: APP_PUBLIC_URL must use HTTPS in production',
      );
    }

    if (
      result.AUTH_ACCESS_TOKEN_SECRET === DEVELOPMENT_ACCESS_TOKEN_SECRET ||
      result.AUTH_THROTTLE_PEPPER === DEVELOPMENT_THROTTLE_PEPPER
    ) {
      throw new EnvironmentValidationError(
        'Environment validation failed: production must not use the development auth secrets',
      );
    }

    if (!result.AUTH_COOKIE_SECURE) {
      throw new EnvironmentValidationError(
        'Environment validation failed: AUTH_COOKIE_SECURE must be true in production',
      );
    }

    try {
      validateProductionCorsOrigins(parseCorsOrigins(result.CORS_ORIGINS));
    } catch (error) {
      throw new EnvironmentValidationError(error instanceof Error ? error.message : String(error));
    }

    if (!result.REDIS_PASSWORD) {
      throw new EnvironmentValidationError(
        'Environment validation failed: REDIS_PASSWORD must be set in production. ' +
          'Redis holds queue payloads, so an unauthenticated instance is ' +
          'readable and writable by anything that reaches its network.',
      );
    }

    for (const key of ['OBJECT_STORAGE_ENDPOINT'] as const) {
      if (!isHttpsUrl(result[key])) {
        throw new EnvironmentValidationError(`Environment validation failed: ${key} must use HTTPS in production`);
      }
    }
  }

  return result;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolves the database this process should actually use.
 *
 * NODE_ENV=test uses a separate database URL by default; TEST_DATABASE_URL overrides it.
 * This naming rule is not an ownership check. Destructive tests use the disposable harness.
 *
 * Exported so the Prisma CLI config can reuse it: the CLI runs outside Nest and would
 * otherwise need a second copy of this rule that could drift from this one.
 */
export function resolveDatabaseUrl(nodeEnv: NodeEnvironment, databaseUrl: string, testDatabaseUrl: string): string {
  if (nodeEnv !== 'test') {
    return databaseUrl;
  }

  if (testDatabaseUrl) {
    return testDatabaseUrl;
  }

  const url = new URL(databaseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;

  return url.toString();
}
