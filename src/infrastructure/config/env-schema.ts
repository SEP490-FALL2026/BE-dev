import Joi from 'joi';
import { parseCorsOrigins, validateProductionCorsOrigins } from './cors';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  API_PREFIX: string;
  CORS_ORIGINS: string;
  TRUST_PROXY_HOPS: number;
  SWAGGER_ENABLED: boolean;
  DATABASE_URL: string;
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
  OIDC_ISSUER: string;
  OIDC_AUDIENCE: string;
  OIDC_JWKS_URI: string;
}

const environmentSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string()
    .pattern(/^[a-z][a-z0-9-]*$/)
    .default('api'),
  CORS_ORIGINS: Joi.string().allow('').default('http://localhost:5173'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(20).default(0),
  SWAGGER_ENABLED: Joi.boolean(),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default('postgresql://app:app@localhost:5432/software_license_management'),
    }),
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
  OIDC_ISSUER: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default('http://localhost:8080/realms/software-license-management'),
    }),
  OIDC_AUDIENCE: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('software-license-api'),
  }),
  OIDC_JWKS_URI: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default(
        'http://localhost:8080/realms/software-license-management/protocol/openid-connect/certs',
      ),
    }),
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
  };

  if (result.NODE_ENV === 'production') {
    validateProductionCorsOrigins(parseCorsOrigins(result.CORS_ORIGINS));

    for (const key of ['OIDC_ISSUER', 'OIDC_JWKS_URI', 'OBJECT_STORAGE_ENDPOINT'] as const) {
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
