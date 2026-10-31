import type { ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { EnvironmentValidationError, validateWithSchema } from '../config/environment-validation';

/** The Redis connection of the BullMQ queue (QueueInfrastructureModule). */
export interface QueueEnvironmentVariables {
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_USERNAME: string;
  REDIS_PASSWORD: string;
  REDIS_TLS: boolean;
}

export const queueKeys = {
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
};

export const QUEUE_ENVIRONMENT_KEYS = Object.keys(queueKeys) as (keyof QueueEnvironmentVariables)[];

export function assertProductionQueue(result: QueueEnvironmentVariables & { NODE_ENV: string }): void {
  if (result.NODE_ENV === 'production' && !result.REDIS_PASSWORD) {
    throw new EnvironmentValidationError(
      'Environment validation failed: REDIS_PASSWORD must be set in production. ' +
        'Redis holds queue payloads, so an unauthenticated instance is ' +
        'readable and writable by anything that reaches its network.',
    );
  }
}

const queueSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  ...queueKeys,
}).unknown(true);

/**
 * The queue's own validation, run when QueueInfrastructureModule is mounted: the API and worker schema does not carry
 * these keys while no Story uses the queue, so mounting the module again restores the strict production rules.
 */
export function validateQueueEnvironment(input: Record<string, unknown>): QueueEnvironmentVariables {
  const result = validateWithSchema(queueSchema, input) as QueueEnvironmentVariables & { NODE_ENV: string };
  assertProductionQueue(result);

  return result;
}

/** Reads and validates the queue settings from the loaded configuration; the module factory calls it when mounted. */
export function queueEnvironmentFrom(config: ConfigService): QueueEnvironmentVariables {
  return validateQueueEnvironment(
    Object.fromEntries(['NODE_ENV', ...QUEUE_ENVIRONMENT_KEYS].map((key) => [key, config.get(key)])),
  );
}
