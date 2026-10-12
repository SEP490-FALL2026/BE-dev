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
}

const environmentSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string()
    .pattern(/^[a-z][a-z0-9-]*$/)
    .default('api'),
  CORS_ORIGINS: Joi.string().allow('').default('http://localhost:5173'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(20).default(0),
  RATE_LIMIT_TTL_MS: Joi.number().integer().min(1_000).max(3_600_000).default(60_000),
  RATE_LIMIT_LIMIT: Joi.number().integer().min(1).max(10_000).default(120),
  SWAGGER_ENABLED: Joi.boolean(),
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
}).unknown(true);

export function validateEnvironment(input: Record<string, unknown>): EnvironmentVariables {
  const validation = environmentSchema.validate(input, {
    abortEarly: false,
    convert: true,
  }) as unknown as { error?: Error; value: unknown };

  if (validation.error) {
    throw new Error(`Environment validation failed: ${validation.error.message}`);
  }

  const parsed = validation.value as Omit<EnvironmentVariables, 'SWAGGER_ENABLED'> & { SWAGGER_ENABLED?: boolean };
  const result = {
    ...parsed,
    SWAGGER_ENABLED: parsed.SWAGGER_ENABLED ?? parsed.NODE_ENV !== 'production',
    // Resolved here rather than at each consumer, so every reader of DATABASE_URL — the
    // Prisma client, a migration script, an integration harness — sees the same database.
    DATABASE_URL: resolveDatabaseUrl(parsed.NODE_ENV, parsed.DATABASE_URL, parsed.TEST_DATABASE_URL),
  };

  if (result.NODE_ENV === 'production') {
    validateProductionCorsOrigins(parseCorsOrigins(result.CORS_ORIGINS));

    if (!result.REDIS_PASSWORD) {
      throw new Error(
        'Environment validation failed: REDIS_PASSWORD must be set in production. ' +
          'Redis holds queue payloads, so an unauthenticated instance is ' +
          'readable and writable by anything that reaches its network.',
      );
    }

    for (const key of ['OBJECT_STORAGE_ENDPOINT'] as const) {
      if (!isHttpsUrl(result[key])) {
        throw new Error(`Environment validation failed: ${key} must use HTTPS in production`);
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
