import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { setTimeout as delay } from 'node:timers/promises';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as redisFactory from '../../../src/infrastructure/redis/redis-client.factory';
import type { RedisSettings } from '../../../src/infrastructure/redis/redis.config';
import { DeviceAuthenticated } from '../../../src/infrastructure/security/decorators/device-authenticated.decorator';
import { Public } from '../../../src/infrastructure/security/decorators/public.decorator';
import { SecurityModule } from '../../../src/infrastructure/security/security.module';
import { ACCESS_TOKEN_VERIFIER } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { DEVICE_CREDENTIAL_VERIFIER } from '../../../src/infrastructure/security/tokens/device-credential-verifier.port';
import {
  keysUnder,
  killClient,
  redisTestSettings,
  toggleableRedisProxy,
  unreachableRedisSettings,
  withRedisPrefix,
} from '../../support/redis-harness';

const DEVICE_ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0001';
const ACCESS = {
  provide: ACCESS_TOKEN_VERIFIER,
  useValue: { verify: () => Promise.reject(new Error('Unexpected user token')) },
};
const DEVICE = {
  provide: DEVICE_CREDENTIAL_VERIFIER,
  useValue: {
    verify: () => Promise.resolve({ status: 'OK', credentialId: DEVICE_ID, collectorKind: 'BROWSER_EXTENSION' }),
  },
};

@Module({ providers: [ACCESS, DEVICE], exports: [ACCESS, DEVICE] })
class ProbeVerifierModule {}

@Controller('probe')
class ProbeController {
  @Get('public')
  @Public()
  publicProbe(): string {
    return 'OK';
  }

  @Get('device')
  @DeviceAuthenticated()
  deviceProbe(): string {
    return 'OK';
  }
}

async function startApp(settings: RedisSettings): Promise<INestApplication<App>> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        skipProcessEnv: true,
        isGlobal: true,
        load: [
          () => ({
            RATE_LIMIT_STORE: 'redis',
            RATE_LIMIT_LIMIT: 3,
            RATE_LIMIT_TTL_MS: 60_000,
            REDIS_HOST: settings.host,
            REDIS_PORT: settings.port,
            REDIS_USERNAME: settings.username,
            REDIS_PASSWORD: settings.password,
            REDIS_TLS: settings.tls,
            REDIS_KEY_PREFIX: settings.keyPrefix,
          }),
        ],
      }),
      SecurityModule.register({ verifierModule: ProbeVerifierModule, deviceVerifierModule: ProbeVerifierModule }),
    ],
    controllers: [ProbeController],
  }).compile();
  const app = module.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

async function waitUntil(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the rate limit store');
    await delay(40);
  }
}

describe('Redis rate-limit storage', () => {
  let redis: Awaited<ReturnType<typeof withRedisPrefix>>;
  let apps: INestApplication<App>[];

  beforeEach(async () => {
    apps = [];
    redis = await withRedisPrefix();
  });

  afterEach(async () => {
    try {
      for (const app of apps) await app.close();
    } finally {
      await redis.cleanup();
    }
  });

  async function appFor(settings: RedisSettings) {
    const app = await startApp(settings);
    apps.push(app);
    return request(app.getHttpServer());
  }

  it('limits two Nest apps together and keeps the device counter under the rate-limit prefix', async () => {
    const settings = redisTestSettings(redis.prefix);
    const apiA = await appFor(settings);
    const apiB = await appFor(settings);
    await apiA.get('/probe/public').expect(200);
    await apiA.get('/probe/public').expect(200);
    await apiB.get('/probe/public').expect(200);
    await apiB.get('/probe/public').expect(429);
    await apiA
      .get('/probe/device')
      .set('authorization', `Bearer sstd_${DEVICE_ID}_${'a'.repeat(43)}`)
      .expect(200);

    const keys = await keysUnder(redis.admin, redis.prefix);
    expect(keys).not.toHaveLength(0);
    expect(keys.every((key) => key.startsWith(`${redis.prefix}:rl:`))).toBe(true);
    expect(keys).toContainEqual(expect.stringContaining(`{device:${DEVICE_ID}:device}:hits`));
  });

  it.each(['unreachable server', 'wrong credentials'])('keeps enforcing the limit with an %s', async (failure) => {
    const username = failure === 'wrong credentials' ? redis.prefix : undefined;
    if (username) await redis.admin.call('ACL', 'SETUSER', username, 'on', '>fixture-right-password');
    try {
      const settings = username
        ? { ...redisTestSettings(redis.prefix), username, password: 'fixture-wrong-password' }
        : unreachableRedisSettings(redis.prefix);
      const api = await appFor(settings);
      const statuses: number[] = [];
      for (let requestNumber = 0; requestNumber < 100; requestNumber++) {
        statuses.push((await api.get('/probe/public')).status);
      }
      expect(statuses.slice(0, 4)).toEqual([200, 200, 200, 429]);
      expect(statuses.filter((status) => status >= 500)).toEqual([]);
      expect(await keysUnder(redis.admin, redis.prefix)).toEqual([]);
    } finally {
      if (username) await redis.admin.call('ACL', 'DELUSER', username);
    }
  });

  it('recovers the same rate limiter after Redis disconnects it', async () => {
    const proxy = await toggleableRedisProxy();
    const factory = jest.spyOn(redisFactory, 'createFailFastRedisClient');
    try {
      const api = await appFor({ ...redisTestSettings(redis.prefix), host: '127.0.0.1', port: proxy.port });
      await api.get('/probe/public').expect(200);
      const client = factory.mock.results[0].value as Redis;
      await killClient(redis.admin, client);
      await proxy.stop();
      await waitUntil(() => client.status !== 'ready');
      await api.get('/probe/public').expect(200);
      await proxy.start();
      await waitUntil(() => client.status === 'ready');
      const [hits] = (await keysUnder(redis.admin, redis.prefix)).filter((key) => key.endsWith(':hits'));
      await waitUntil(async () => {
        await api.get('/probe/public');
        return Number(await redis.admin.get(hits)) > 1;
      });
    } finally {
      factory.mockRestore();
      await proxy.close();
    }
  });
});
