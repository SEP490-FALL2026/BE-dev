import type { ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { EnvironmentValidationError, validateWithSchema } from '../config/environment-validation';

export interface RedisEnvironmentVariables {
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_USERNAME: string;
  REDIS_PASSWORD: string;
  REDIS_TLS: boolean;
  REDIS_KEY_PREFIX: string;
}

export interface RedisFeatureEnvironmentVariables {
  RATE_LIMIT_STORE: 'redis' | 'memory';
  BACKGROUND_JOBS_TRANSPORT: 'bullmq' | 'poll';
  QUEUE_RELAY_INTERVAL_MS: number;
  EMAIL_QUEUE_CONCURRENCY: number;
  QUEUE_BOARD_ENABLED: boolean;
  QUEUE_BOARD_USERNAME: string;
  QUEUE_BOARD_PASSWORD: string;
}

export interface RedisSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
  keyPrefix: string;
}

const redisHost = Joi.string().hostname();
export const redisKeys = {
  REDIS_HOST: redisHost,
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_USERNAME: Joi.string().allow('').default(''),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_TLS: Joi.boolean().default(false),
  REDIS_KEY_PREFIX: Joi.string()
    .pattern(/^[a-z0-9-]{1,32}$/)
    .default('slm'),
};

export const REDIS_ENVIRONMENT_KEYS = Object.keys(redisKeys) as (keyof RedisEnvironmentVariables)[];

export const redisFeatureKeys = {
  RATE_LIMIT_STORE: Joi.string()
    .valid('redis', 'memory')
    .when('NODE_ENV', {
      is: 'test',
      then: Joi.any().default('memory'),
      otherwise: Joi.any().default('redis'),
    }),
  BACKGROUND_JOBS_TRANSPORT: Joi.string()
    .valid('bullmq', 'poll')
    .when('NODE_ENV', {
      is: 'test',
      then: Joi.any().default('poll'),
      otherwise: Joi.any().default('bullmq'),
    }),
  QUEUE_RELAY_INTERVAL_MS: Joi.number().integer().min(200).max(60_000).default(1_000),
  EMAIL_QUEUE_CONCURRENCY: Joi.number().integer().min(1).max(10).default(2),
  QUEUE_BOARD_ENABLED: Joi.boolean().default(false),
  QUEUE_BOARD_USERNAME: Joi.string().allow('').default(''),
  QUEUE_BOARD_PASSWORD: Joi.string().allow('').default(''),
};

type RedisFeatures = Pick<
  RedisFeatureEnvironmentVariables,
  'RATE_LIMIT_STORE' | 'BACKGROUND_JOBS_TRANSPORT' | 'QUEUE_BOARD_ENABLED'
>;

export function usesRedis(env: RedisFeatures): boolean {
  return env.RATE_LIMIT_STORE === 'redis' || env.BACKGROUND_JOBS_TRANSPORT === 'bullmq' || env.QUEUE_BOARD_ENABLED;
}

const production = Joi.object({ NODE_ENV: Joi.valid('production').required() }).unknown();
const withoutRedis = Joi.object({
  RATE_LIMIT_STORE: Joi.valid('memory').required(),
  BACKGROUND_JOBS_TRANSPORT: Joi.valid('poll').required(),
  QUEUE_BOARD_ENABLED: Joi.boolean().valid(false),
}).unknown();

export function withRedisHostValidation(schema: Joi.ObjectSchema): Joi.ObjectSchema {
  return schema.when(production, {
    then: Joi.object().when(withoutRedis, {
      then: Joi.object({ REDIS_HOST: redisHost.default('localhost') }),
      otherwise: Joi.object({ REDIS_HOST: redisHost.required() }),
    }),
    otherwise: Joi.object({ REDIS_HOST: redisHost.default('localhost') }),
  });
}

export function assertProductionRedisPassword(result: RedisEnvironmentVariables): void {
  if (result.REDIS_PASSWORD) return;
  throw new EnvironmentValidationError(
    'Environment validation failed: REDIS_PASSWORD must be set in production. ' +
      'Redis holds queue payloads, so an unauthenticated instance is ' +
      'readable and writable by anything that reaches its network.',
  );
}

export function assertProductionQueueBoard(result: RedisFeatureEnvironmentVariables): void {
  if (!result.QUEUE_BOARD_ENABLED) return;
  if (!result.QUEUE_BOARD_USERNAME) {
    throw new EnvironmentValidationError('Environment validation failed: QUEUE_BOARD_USERNAME is required');
  }
  if (result.QUEUE_BOARD_PASSWORD.length < 20 || result.QUEUE_BOARD_PASSWORD === result.QUEUE_BOARD_USERNAME) {
    throw new EnvironmentValidationError(
      'Environment validation failed: QUEUE_BOARD_PASSWORD must have at least 20 characters and differ from QUEUE_BOARD_USERNAME',
    );
  }
}

const redisSchema = withRedisHostValidation(
  Joi.object({
    NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
    ...redisKeys,
  }).unknown(true),
);

export function validateRedisEnvironment(input: Record<string, unknown>): RedisEnvironmentVariables {
  const result = validateWithSchema(redisSchema, input) as RedisEnvironmentVariables & { NODE_ENV: string };
  if (result.NODE_ENV === 'production') assertProductionRedisPassword(result);
  return result;
}

const backgroundJobsTransportSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  BACKGROUND_JOBS_TRANSPORT: redisFeatureKeys.BACKGROUND_JOBS_TRANSPORT,
}).unknown(true);

/**
 * Reads only the transport the worker must choose before Nest builds its module graph. It deliberately does not run
 * the whole environment schema: `ConfigModule` has already validated it when `WorkerModule` was imported and has
 * written the defaults back into `process.env` (including `TEST_DATABASE_URL: ''`, which the full schema refuses
 * outside the test environment), so a second whole-schema pass over `process.env` fails in production.
 */
export function readBackgroundJobsTransport(input: Record<string, unknown>): 'bullmq' | 'poll' {
  const result = validateWithSchema(backgroundJobsTransportSchema, input) as Pick<
    RedisFeatureEnvironmentVariables,
    'BACKGROUND_JOBS_TRANSPORT'
  >;
  return result.BACKGROUND_JOBS_TRANSPORT;
}

export function redisSettingsFrom(config: ConfigService<RedisEnvironmentVariables, true>): RedisSettings {
  return {
    host: config.get('REDIS_HOST', { infer: true }),
    port: config.get('REDIS_PORT', { infer: true }),
    username: config.get('REDIS_USERNAME', { infer: true }),
    password: config.get('REDIS_PASSWORD', { infer: true }),
    tls: config.get('REDIS_TLS', { infer: true }),
    keyPrefix: config.get('REDIS_KEY_PREFIX', { infer: true }),
  };
}
