import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

/**
 * R-07 (Owner, 14/10/2026): the global rate limit is kept per route and per client IP, held in the
 * memory of each process. These tests pin that contract so a change to a shared per-IP budget, or to
 * how the client address is chosen, fails here instead of surfacing in production.
 *
 * ConfigModule validates process.env when AppModule is first imported, so every app is built from a
 * freshly imported module graph with the variables for that case. Every Nest package is imported
 * after the reset too: mixing a pre-reset @nestjs/testing with a fresh AppModule gives two copies of
 * @nestjs/core that cannot resolve each other's providers.
 */
const LIMIT = 3;
// ConfigModule writes its resolved defaults (some of them empty) back into process.env, which a
// second validation would then reject. Every app therefore starts from the original environment.
const baselineEnv = { ...process.env };

async function startApp(trustProxyHops: number): Promise<INestApplication<App>> {
  process.env = { ...baselineEnv };
  Object.assign(process.env, {
    RATE_LIMIT_LIMIT: String(LIMIT),
    RATE_LIMIT_TTL_MS: '60000',
    TRUST_PROXY_HOPS: String(trustProxyHops),
  });
  jest.resetModules();
  const { Controller, Get } = await import('@nestjs/common');
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../../src/app.module');
  const { configureApplication } = await import('../../src/bootstrap');
  const { Public } = await import('../../src/infrastructure/security/decorators/public.decorator');

  @Controller({ path: 'rate-probe', version: '1' })
  class RateProbeController {
    @Get('a')
    @Public()
    a(): { route: 'a' } {
      return { route: 'a' };
    }

    @Get('b')
    @Public()
    b(): { route: 'b' } {
      return { route: 'b' };
    }
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [RateProbeController],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApplication(app);
  await app.init();

  return app;
}

describe('Global rate limit (e2e)', () => {
  let app: INestApplication<App> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(() => {
    process.env = { ...baselineEnv };
  });

  const get = (path: string, ip?: string) => {
    const call = request(app!.getHttpServer()).get(path);
    return ip ? call.set('x-forwarded-for', ip) : call;
  };

  const exhaust = async (path: string, ip?: string) => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) await get(path, ip).expect(200);
  };

  describe('behind one trusted proxy hop', () => {
    beforeEach(async () => {
      app = await startApp(1);
    });

    it('shares one budget between requests from the same IP to the same route', async () => {
      await exhaust('/api/v1/rate-probe/a', '198.51.100.1');

      await get('/api/v1/rate-probe/a', '198.51.100.1').expect(429);
    });

    it('keeps a separate budget for each route, even from the same IP', async () => {
      await exhaust('/api/v1/rate-probe/a', '198.51.100.1');

      await get('/api/v1/rate-probe/a', '198.51.100.1').expect(429);
      await exhaust('/api/v1/rate-probe/b', '198.51.100.1');
      await get('/api/v1/rate-probe/b', '198.51.100.1').expect(429);
    });

    it('counts each client IP independently', async () => {
      await exhaust('/api/v1/rate-probe/a', '198.51.100.1');
      await get('/api/v1/rate-probe/a', '198.51.100.1').expect(429);

      await exhaust('/api/v1/rate-probe/a', '198.51.100.2');
    });

    it('still limits public and authentication routes', async () => {
      for (const path of ['/api/v1/health/live']) {
        await exhaust(path, '198.51.100.3');
        await get(path, '198.51.100.3').expect(429);
      }
      // Any answer counts toward the limit (a missing refresh cookie is 401), then the limiter takes over.
      for (let attempt = 0; attempt < LIMIT; attempt += 1) {
        await request(app!.getHttpServer()).post('/api/v1/auth/refresh').set('x-forwarded-for', '198.51.100.4');
      }
      await request(app!.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-forwarded-for', '198.51.100.4')
        .expect(429);
      await request(app!.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('x-forwarded-for', '198.51.100.4')
        .expect(204);
    });
  });

  describe('with no trusted proxy configured', () => {
    beforeEach(async () => {
      app = await startApp(0);
    });

    it('ignores X-Forwarded-For, so rotating it does not escape the limit', async () => {
      for (let attempt = 0; attempt < LIMIT; attempt += 1) {
        await get('/api/v1/rate-probe/a', `203.0.113.${attempt + 10}`).expect(200);
      }

      await get('/api/v1/rate-probe/a', '203.0.113.99').expect(429);
    });
  });
});
