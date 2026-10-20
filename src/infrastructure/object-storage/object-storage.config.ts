import type { ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { EnvironmentValidationError, isHttpsUrl, validateWithSchema } from '../config/environment-validation';

/** The S3-compatible bucket of ObjectStorageModule. */
export interface ObjectStorageEnvironmentVariables {
  OBJECT_STORAGE_ENDPOINT: string;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_BUCKET: string;
  OBJECT_STORAGE_ACCESS_KEY_ID: string;
  OBJECT_STORAGE_SECRET_ACCESS_KEY: string;
  OBJECT_STORAGE_FORCE_PATH_STYLE: boolean;
}

export const objectStorageKeys = {
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
};

export const OBJECT_STORAGE_ENVIRONMENT_KEYS = Object.keys(
  objectStorageKeys,
) as (keyof ObjectStorageEnvironmentVariables)[];

export function assertProductionObjectStorage(result: ObjectStorageEnvironmentVariables & { NODE_ENV: string }): void {
  if (result.NODE_ENV === 'production' && !isHttpsUrl(result.OBJECT_STORAGE_ENDPOINT)) {
    throw new EnvironmentValidationError(
      'Environment validation failed: OBJECT_STORAGE_ENDPOINT must use HTTPS in production',
    );
  }
}

const objectStorageSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  ...objectStorageKeys,
}).unknown(true);

/**
 * The storage's own validation, run when ObjectStorageModule is mounted: the API and worker schema does not carry these
 * keys while no Story uses storage (E2 = A), so mounting the module again restores the strict production rules.
 */
export function validateObjectStorageEnvironment(input: Record<string, unknown>): ObjectStorageEnvironmentVariables {
  const result = validateWithSchema(objectStorageSchema, input) as ObjectStorageEnvironmentVariables & {
    NODE_ENV: string;
  };
  assertProductionObjectStorage(result);

  return result;
}

/** Reads and validates the storage settings from the loaded configuration; the module factory calls it when mounted. */
export function objectStorageEnvironmentFrom(config: ConfigService): ObjectStorageEnvironmentVariables {
  return validateObjectStorageEnvironment(
    Object.fromEntries(['NODE_ENV', ...OBJECT_STORAGE_ENVIRONMENT_KEYS].map((key) => [key, config.get(key)])),
  );
}
