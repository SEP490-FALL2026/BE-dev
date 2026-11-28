import { ConfigService } from '@nestjs/config';
import { EnvironmentValidationError } from '../config/environment-validation';
import { createQueueConfiguration } from '../queue/queue-infrastructure.module';
import { readBackgroundJobsTransport, REDIS_ENVIRONMENT_KEYS, validateRedisEnvironment } from './redis.config';

/** Made-up values for this spec. */
const PRODUCTION = { NODE_ENV: 'production', REDIS_HOST: 'redis.internal', REDIS_PASSWORD: 'queue-spec-password' };

describe('Redis configuration', () => {
  it('owns exactly the Redis keys', () => {
    expect([...REDIS_ENVIRONMENT_KEYS].sort()).toEqual(
      ['REDIS_HOST', 'REDIS_KEY_PREFIX', 'REDIS_PASSWORD', 'REDIS_PORT', 'REDIS_TLS', 'REDIS_USERNAME'].sort(),
    );
  });

  it('requires the host and a password in production', () => {
    expect(() => validateRedisEnvironment({ NODE_ENV: 'production' })).toThrow('"REDIS_HOST" is required');
    expect(() => validateRedisEnvironment({ ...PRODUCTION, REDIS_PASSWORD: '' })).toThrow(
      'REDIS_PASSWORD must be set in production',
    );
    expect(validateRedisEnvironment(PRODUCTION)).toMatchObject({ REDIS_HOST: 'redis.internal', REDIS_PORT: 6379 });
  });

  it.each(['development', 'test'])('runs against a local Redis with no password in %s', (nodeEnvironment) => {
    expect(validateRedisEnvironment({ NODE_ENV: nodeEnvironment })).toEqual({
      NODE_ENV: nodeEnvironment,
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_USERNAME: '',
      REDIS_PASSWORD: '',
      REDIS_TLS: false,
      REDIS_KEY_PREFIX: 'slm',
    });
  });

  it('validates again when the module is mounted, so a production remount without a password fails to boot', () => {
    const config = (values: Record<string, string>) => new ConfigService(values);

    expect(() => createQueueConfiguration(config({ NODE_ENV: 'production', REDIS_HOST: 'redis.internal' }))).toThrow(
      EnvironmentValidationError,
    );
    expect(() => createQueueConfiguration(config({ NODE_ENV: 'production', REDIS_HOST: 'redis.internal' }))).toThrow(
      'REDIS_PASSWORD',
    );
    expect(() =>
      createQueueConfiguration(config({ ...PRODUCTION, REDIS_PORT: '6380', REDIS_TLS: 'true' })),
    ).not.toThrow();
  });
});

describe('readBackgroundJobsTransport', () => {
  it('defaults to bullmq outside the test environment and to poll in test', () => {
    expect(readBackgroundJobsTransport({ NODE_ENV: 'production' })).toBe('bullmq');
    expect(readBackgroundJobsTransport({ NODE_ENV: 'test' })).toBe('poll');
  });

  it('reads the selected transport and ignores every other key, including ones the full schema refuses', () => {
    expect(
      readBackgroundJobsTransport({ NODE_ENV: 'production', BACKGROUND_JOBS_TRANSPORT: 'poll', TEST_DATABASE_URL: '' }),
    ).toBe('poll');
  });

  it('still rejects an unknown transport', () => {
    expect(() => readBackgroundJobsTransport({ BACKGROUND_JOBS_TRANSPORT: 'kafka' })).toThrow(
      EnvironmentValidationError,
    );
  });
});
