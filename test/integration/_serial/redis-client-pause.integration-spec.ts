import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { createHttpTestApp } from '../../support/http-test-app';
import { keysUnder, pauseServer, withRedisPrefix } from '../../support/redis-harness';

describe('Redis throttler when commands time out', () => {
  let redis: Awaited<ReturnType<typeof withRedisPrefix>> | undefined;
  let prefix: string;
  let app: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;

  beforeAll(async () => {
    redis = await withRedisPrefix();
    prefix = redis.prefix.slice(0, 32);
    app = await createHttpTestApp({
      env: {
        RATE_LIMIT_STORE: 'redis',
        RATE_LIMIT_LIMIT: '3',
        REDIS_HOST: redis.admin.options.host ?? '127.0.0.1',
        REDIS_PORT: String(redis.admin.options.port),
        REDIS_KEY_PREFIX: prefix,
      },
    });
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
      if (!redis) return;
      const keys = await keysUnder(redis.admin, prefix);
      if (keys.length) await redis.admin.del(...keys);
    } finally {
      await redis?.cleanup();
    }
  });

  it('uses the memory counter during a real Redis pause and returns to Redis', async () => {
    if (!app || !redis) throw new Error('The serial Redis fixture failed to start');
    const api = request(app.app.getHttpServer());
    await api.get('/api/v1/health/live').expect(200);
    const [key] = await keysUnder(redis.admin, prefix);
    expect(key).toEqual(expect.stringContaining(':rl:'));
    await pauseServer(redis.admin, 400);
    for (let hit = 0; hit < 3; hit++) await api.get('/api/v1/health/live').expect(200);
    await api.get('/api/v1/health/live').expect(429);
    const valueDuringFallback = Number(await redis.admin.get(key));

    const deadline = Date.now() + 8_000;
    while (Number(await redis.admin.get(key)) === valueDuringFallback) {
      if (Date.now() >= deadline) throw new Error('Timed out waiting for rate-limit counters in Redis');
      await api.get('/api/v1/health/live');
      await delay(50);
    }
    expect(Number(await redis.admin.get(key))).toBeGreaterThan(valueDuringFallback);
  });
});
