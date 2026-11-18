import { ConfigService } from '@nestjs/config';
import { EnvironmentValidationError } from '../config/environment-validation';
import { createQueueConfiguration } from './queue-infrastructure.module';
import { QUEUE_ENVIRONMENT_KEYS, validateQueueEnvironment } from './queue.config';

/** Made-up values for this spec. */
const PRODUCTION = { NODE_ENV: 'production', REDIS_HOST: 'redis.internal', REDIS_PASSWORD: 'queue-spec-password' };

describe('queue configuration (validated when QueueInfrastructureModule is mounted — H6.4, E2 = A)', () => {
  it('owns exactly the Redis keys', () => {
    expect([...QUEUE_ENVIRONMENT_KEYS].sort()).toEqual(
      ['REDIS_HOST', 'REDIS_PASSWORD', 'REDIS_PORT', 'REDIS_TLS', 'REDIS_USERNAME'].sort(),
    );
  });

  it('requires the host and a password in production', () => {
    expect(() => validateQueueEnvironment({ NODE_ENV: 'production' })).toThrow('"REDIS_HOST" is required');
    expect(() => validateQueueEnvironment({ ...PRODUCTION, REDIS_PASSWORD: '' })).toThrow(
      'REDIS_PASSWORD must be set in production',
    );
    expect(validateQueueEnvironment(PRODUCTION)).toMatchObject({ REDIS_HOST: 'redis.internal', REDIS_PORT: 6379 });
  });

  it.each(['development', 'test'])('runs against a local Redis with no password in %s', (nodeEnvironment) => {
    expect(validateQueueEnvironment({ NODE_ENV: nodeEnvironment })).toEqual({
      NODE_ENV: nodeEnvironment,
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_USERNAME: '',
      REDIS_PASSWORD: '',
      REDIS_TLS: false,
    });
  });

  it('validates again when the module is mounted, so a production remount without a password fails to boot', () => {
    const config = (values: Record<string, string>) => new ConfigService(values);

    expect(() => createQueueConfiguration(config({ NODE_ENV: 'production', REDIS_HOST: 'redis.internal' }))).toThrow(
      EnvironmentValidationError,
    );
    expect(createQueueConfiguration(config({ ...PRODUCTION, REDIS_PORT: '6380', REDIS_TLS: 'true' }))).toMatchObject({
      connection: { host: 'redis.internal', port: 6380, password: 'queue-spec-password', tls: {} },
    });
  });
});
