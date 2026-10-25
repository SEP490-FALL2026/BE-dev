import Joi from 'joi';
import { parseCorsOrigins, validateProductionCorsOrigins } from './cors';
import {
  DatabaseEnvironmentVariables,
  assertDatabaseLimits,
  databaseKeys,
  resolveDatabaseSettings,
} from './database-environment';
import { EnvironmentValidationError, isHttpsUrl, validateWithSchema } from './environment-validation';
import { SecretEnvironmentVariables, assertSecrets, secretKeys } from './secret-environment';

/*
 * The one public contract of the environment configuration: the settings type and the validators. The parts live
 * beside it by responsibility — database (also the installation command) and secrets (E3 = C) — and are composed here.
 * The queue and object storage validate their own keys when their module is mounted; the API, the worker and the
 * recovery command mount neither (E2 = A), so their keys are not part of this contract.
 */
export { EnvironmentValidationError } from './environment-validation';
export { resolveDatabaseUrl } from './database-url';
export { validateInstallationEnvironment } from './database-environment';
export type { DatabaseEnvironmentVariables, NodeEnvironment } from './database-environment';

export interface EnvironmentVariables extends DatabaseEnvironmentVariables, SecretEnvironmentVariables {
  PORT: number;
  API_PREFIX: string;
  CORS_ORIGINS: string;
  TRUST_PROXY_HOPS: number;
  RATE_LIMIT_TTL_MS: number;
  RATE_LIMIT_LIMIT: number;
  SWAGGER_ENABLED: boolean;
  AUTH_ACCESS_TOKEN_TTL_SECONDS: number;
  AUTH_SESSION_IDLE_SECONDS: number;
  AUTH_SESSION_ABSOLUTE_SECONDS: number;
  AUTH_LOGIN_MAX_FAILURES: number;
  AUTH_LOGIN_WINDOW_SECONDS: number;
  AUTH_LOGIN_BLOCK_SECONDS: number;
  AUTH_JWT_ISSUER: string;
  AUTH_JWT_AUDIENCE: string;
  AUTH_INVITATION_TTL_SECONDS: number;
  /** How long a password-reset link works (T-1). */
  AUTH_PASSWORD_RESET_TTL_SECONDS: number;
  /** Reset links one account can be issued in any 60 minutes; further requests are answered the same but issue none (T-2). */
  AUTH_PASSWORD_RESET_MAX_PER_HOUR: number;
  APP_PUBLIC_URL: string;
  /** `id:base64` pairs separated by commas: keys that may still seal pending rows after a rotation. */
  OUTBOX_PAYLOAD_PREVIOUS_KEYS: string;
  OUTBOX_POLL_INTERVAL_MS: number;
  /** How often the worker looks at the open steps of requests: who holds a step that waits, whose holder left (ms). */
  REQUEST_WORK_INTERVAL_MS: number;
  /** `id:base64` pairs separated by commas: vault keys that may still open license keys sealed before a rotation. */
  LICENSE_KEY_VAULT_PREVIOUS_KEYS: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  SMTP_FROM: string;
  SMTP_TLS: boolean;
}

// Key order is the order Joi reports missing keys in, so it stays stable.
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
  AUTH_ACCESS_TOKEN_SECRET: secretKeys.AUTH_ACCESS_TOKEN_SECRET,
  AUTH_ACCESS_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).max(3_600).default(600),
  AUTH_SESSION_IDLE_SECONDS: Joi.number().integer().min(300).max(2_592_000).default(28_800),
  AUTH_SESSION_ABSOLUTE_SECONDS: Joi.number().integer().min(300).max(7_776_000).default(604_800),
  AUTH_LOGIN_MAX_FAILURES: Joi.number().integer().min(3).max(100).default(5),
  AUTH_LOGIN_WINDOW_SECONDS: Joi.number().integer().min(30).max(86_400).default(900),
  AUTH_LOGIN_BLOCK_SECONDS: Joi.number().integer().min(30).max(86_400).default(900),
  AUTH_THROTTLE_PEPPER: secretKeys.AUTH_THROTTLE_PEPPER,
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
  OUTBOX_PAYLOAD_KEY: secretKeys.OUTBOX_PAYLOAD_KEY,
  OUTBOX_PAYLOAD_KEY_ID: secretKeys.OUTBOX_PAYLOAD_KEY_ID,
  OUTBOX_PAYLOAD_PREVIOUS_KEYS: Joi.string().allow('').default(''),
  OUTBOX_POLL_INTERVAL_MS: Joi.number().integer().min(500).max(60_000).default(3_000),
  REQUEST_WORK_INTERVAL_MS: Joi.number().integer().min(1_000).max(300_000).default(10_000),
  LICENSE_KEY_VAULT_KEY: secretKeys.LICENSE_KEY_VAULT_KEY,
  LICENSE_KEY_VAULT_KEY_ID: secretKeys.LICENSE_KEY_VAULT_KEY_ID,
  LICENSE_KEY_FINGERPRINT_PEPPER: secretKeys.LICENSE_KEY_FINGERPRINT_PEPPER,
  LICENSE_KEY_VAULT_PREVIOUS_KEYS: Joi.string().allow('').default(''),
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

/** Validates the environment of the API, the worker and the recovery command. */
export function validateEnvironment(input: Record<string, unknown>): EnvironmentVariables {
  const parsed = validateWithSchema(environmentSchema, input) as Omit<
    EnvironmentVariables,
    'SWAGGER_ENABLED' | 'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS'
  > & {
    SWAGGER_ENABLED?: boolean;
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS?: number;
  };
  const result = {
    ...parsed,
    ...resolveDatabaseSettings(parsed),
    SWAGGER_ENABLED: parsed.SWAGGER_ENABLED ?? parsed.NODE_ENV !== 'production',
  };

  assertDatabaseLimits(result);

  if (result.AUTH_SESSION_IDLE_SECONDS > result.AUTH_SESSION_ABSOLUTE_SECONDS) {
    throw new EnvironmentValidationError(
      'Environment validation failed: AUTH_SESSION_IDLE_SECONDS must not exceed AUTH_SESSION_ABSOLUTE_SECONDS',
    );
  }

  assertSecrets(result);

  if (result.NODE_ENV === 'production') {
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

    try {
      validateProductionCorsOrigins(parseCorsOrigins(result.CORS_ORIGINS));
    } catch (error) {
      throw new EnvironmentValidationError(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}
