import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env-schema';
import * as redisFactory from '../redis/redis-client.factory';
import { QueueWorkerFactory } from './queue-worker-factory';

describe('queue worker factory', () => {
  it('closes a running worker even when Redis never became ready', async () => {
    const config = new ConfigService<EnvironmentVariables, true>({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 1,
      REDIS_KEY_PREFIX: 'fixture',
    });
    const factory = new QueueWorkerFactory(config);
    const processor = jest.fn().mockResolvedValue(undefined);
    const worker = factory.create('email-delivery', processor, 1);
    const running = factory.run(worker).catch(() => undefined);

    try {
      await expect(factory.close(worker)).resolves.toBeUndefined();
      await running;
      expect(processor).not.toHaveBeenCalled();
    } finally {
      await worker.close(true);
    }
  });

  it('creates a blocking client and leaves starting the worker to its owner', async () => {
    const config = new ConfigService<EnvironmentVariables, true>({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 1,
      REDIS_KEY_PREFIX: 'fixture',
    });
    const factory = new QueueWorkerFactory(config);
    const blocking = jest.spyOn(redisFactory, 'createBlockingRedisClient');
    const worker = factory.create('email-delivery', () => Promise.resolve('OK'), 2);
    try {
      expect(worker.opts).toMatchObject({ prefix: 'fixture:bull', concurrency: 2, autorun: false });
      expect(worker.isRunning()).toBe(false);
      expect(blocking).toHaveBeenCalledTimes(1);
      const client = blocking.mock.results[0].value as ReturnType<typeof redisFactory.createBlockingRedisClient>;
      expect(client.options).toMatchObject({ maxRetriesPerRequest: null, lazyConnect: false, keyPrefix: '' });
    } finally {
      await worker.close(true);
      blocking.mockRestore();
    }
  });
});
