import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';
import { FallbackThrottlerStorage } from './fallback-throttler.storage';

const counterResult = { totalHits: 2, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 };

function fixture() {
  const primary = { increment: jest.fn().mockResolvedValue(counterResult) };
  const fallback = new ThrottlerStorageService();
  const increment = jest.spyOn(fallback, 'increment');
  const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  let now = 1_000;
  const storage = new FallbackThrottlerStorage(primary, fallback, null, logger, () => now);
  return {
    primary,
    increment,
    logger,
    storage,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('Redis rate limit fallback', () => {
  it('returns the shared Redis counter when the store is available', async () => {
    const { storage, increment } = fixture();
    try {
      await expect(storage.increment('key', 60_000, 3, 60_000, 'default')).resolves.toEqual(counterResult);
      expect(increment).not.toHaveBeenCalled();
    } finally {
      await storage.onApplicationShutdown();
    }
  });

  it.each([
    ['connection refused', Object.assign(new Error('Redis host unreachable'), { code: 'ECONNREFUSED' })],
    ['command timeout', new Error('Command timed out')],
    ['memory limit', new Error('OOM command not allowed')],
  ])('limits requests in memory after %s and retries Redis only when due', async (_name, failure) => {
    const { primary, increment, logger, storage, advance } = fixture();
    primary.increment.mockRejectedValueOnce(failure);

    try {
      await expect(storage.increment('key', 60_000, 3, 60_000, 'default')).resolves.toMatchObject({ totalHits: 1 });
      advance(4_999);
      await expect(storage.increment('key', 60_000, 3, 60_000, 'default')).resolves.toMatchObject({ totalHits: 2 });
      expect(primary.increment).toHaveBeenCalledTimes(1);
      expect(increment).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('fell back'));
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining(failure.message));

      advance(2);
      await expect(storage.increment('key', 60_000, 3, 60_000, 'default')).resolves.toEqual(counterResult);
      expect(primary.increment).toHaveBeenCalledTimes(2);
      expect(logger.log).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('returned'));
    } finally {
      await storage.onApplicationShutdown();
    }
  });

  it('wraps the real adapter without replacing its configured Redis client and closes it', async () => {
    const client = new Redis({ lazyConnect: true });
    const primary = new ThrottlerStorageRedisService(client);
    expect(primary.redis).toBe(client);
    const fallback = new ThrottlerStorageService();
    const cleanup = jest.spyOn(fallback, 'onApplicationShutdown');
    const quit = jest.spyOn(client, 'quit').mockResolvedValue('OK');
    const storage = new FallbackThrottlerStorage(primary, fallback, client, {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    });

    await storage.onApplicationShutdown();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
    client.disconnect();
  });
});
