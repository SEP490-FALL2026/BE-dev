import { setTimeout as delay } from 'node:timers/promises';
import { createFailFastRedisClient } from '../../../src/infrastructure/redis/redis-client.factory';
import {
  keysUnder,
  redisTestSettings,
  redisTestUrl,
  toggleableRedisProxy,
  withRedisPrefix,
} from '../../support/redis-harness';

async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('Redis client did not reach its expected state');
    await delay(25);
  }
}

describe('Redis integration fixture', () => {
  it('connects to Redis and removes only keys under the fixture prefix', async () => {
    const first = await withRedisPrefix();
    const second = await withRedisPrefix();
    try {
      expect(await first.admin.ping()).toBe('PONG');
      await first.admin.set(`${first.prefix}:one`, '1');
      await first.admin.set(`${second.prefix}:two`, '2');
      expect(await keysUnder(second.admin, first.prefix)).toEqual([`${first.prefix}:one`]);
      await first.cleanup();
      expect(await keysUnder(second.admin, first.prefix)).toEqual([]);
      expect(await keysUnder(second.admin, second.prefix)).toEqual([`${second.prefix}:two`]);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it('restores a broken Redis path on the same client and proxy port', async () => {
    const proxy = await toggleableRedisProxy();
    const client = createFailFastRedisClient(
      { ...redisTestSettings('slm-test-proxy'), host: '127.0.0.1', port: proxy.port },
      'harness',
    );
    client.on('error', () => undefined);
    try {
      await until(() => client.status === 'ready');
      expect(await client.ping()).toBe('PONG');
      await proxy.stop();
      await until(() => client.status !== 'ready');
      await expect(client.ping()).rejects.toThrow(/offline queue|Connection is closed|enableOfflineQueue/);
      await proxy.start();
      await until(() => client.status === 'ready');
      expect(await client.ping()).toBe('PONG');
    } finally {
      client.disconnect();
      await proxy.close();
    }
  });

  it('fails on CI when TEST_REDIS_URL is missing', () => {
    const previousCi = process.env.CI;
    const previousRedis = process.env.TEST_REDIS_URL;
    process.env.CI = 'true';
    delete process.env.TEST_REDIS_URL;
    try {
      expect(redisTestUrl).toThrow('TEST_REDIS_URL is required on CI');
    } finally {
      if (previousCi === undefined) delete process.env.CI;
      else process.env.CI = previousCi;
      if (previousRedis !== undefined) process.env.TEST_REDIS_URL = previousRedis;
    }
  });
});
