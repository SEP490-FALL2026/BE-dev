import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApplication } from '../../../src/app/configure-application';
import type { EnvironmentVariables } from '../../../src/infrastructure/config/env-schema';
import { QUEUE_BOARD_PATH } from '../../../src/infrastructure/queue/queue-board-auth';
import { QueueBoardMount } from '../../../src/infrastructure/queue/queue-board.mount';
import { QueueProducers } from '../../../src/infrastructure/queue/queue-producers';
import { redisTestSettings, withRedisPrefix } from '../../support/redis-harness';

const username = 'ops';
const password = 'mật:khẩu:chỉ-dùng-kiểm-thử';

async function startBoard(config: ConfigService<EnvironmentVariables, true>): Promise<INestApplication<App>> {
  const module = await Test.createTestingModule({
    providers: [QueueBoardMount, { provide: ConfigService, useValue: config }],
  }).compile();
  const app = module.createNestApplication<INestApplication<App>>();
  configureApplication(app, { mountDocs: false });
  return app.init();
}

describe('read-only queue dashboard', () => {
  it('leaves the dashboard unmounted by default', async () => {
    const app = await startBoard(new ConfigService({ API_PREFIX: 'api', CORS_ORIGINS: '', TRUST_PROXY_HOPS: 0 }));
    try {
      await request(app.getHttpServer()).get(QUEUE_BOARD_PATH).expect(404);
    } finally {
      await app.close();
    }
  });

  it('authenticates all dashboard requests, counts real jobs and disallows mutations', async () => {
    const fixture = await withRedisPrefix();
    const redis = redisTestSettings(fixture.prefix);
    const config = new ConfigService<EnvironmentVariables, true>({
      API_PREFIX: 'api',
      CORS_ORIGINS: '',
      TRUST_PROXY_HOPS: 0,
      REDIS_HOST: redis.host,
      REDIS_PORT: redis.port,
      REDIS_USERNAME: redis.username,
      REDIS_PASSWORD: redis.password,
      REDIS_TLS: redis.tls,
      REDIS_KEY_PREFIX: redis.keyPrefix,
      QUEUE_BOARD_ENABLED: true,
      QUEUE_BOARD_USERNAME: username,
      QUEUE_BOARD_PASSWORD: password,
    });
    const producers = new QueueProducers(config);
    let app: INestApplication<App> | undefined;
    try {
      const queue = producers.get('email-delivery');
      const client = await queue.getBackend().client;
      if (client.status !== 'ready') {
        await new Promise<void>((resolve, reject) => {
          client.once('ready', resolve);
          client.once('error', reject);
        });
      }
      const job = await queue.add('deliver', { outboxId: '00000000-0000-4000-8000-000000000000' }, { delay: 300_000 });
      app = await startBoard(config);
      const http = request(app.getHttpServer());
      const lists = `${QUEUE_BOARD_PATH}/api/queues`;
      await http
        .get(QUEUE_BOARD_PATH)
        .expect(401)
        .expect('WWW-Authenticate', 'Basic realm="queues", charset="UTF-8"')
        .expect('Cache-Control', 'no-store')
        .expect('X-Robots-Tag', 'noindex');
      await http.get(lists).auth(username, 'bad').expect(401);
      await http.get(lists).auth('other', password).expect(401);
      await http
        .get(QUEUE_BOARD_PATH)
        .auth(username, password)
        .expect(200)
        .expect('Content-Security-Policy', /script-src 'self'/)
        .expect('Cache-Control', 'no-store')
        .expect('X-Robots-Tag', 'noindex')
        .expect((response) => {
          expect(response.headers).not.toHaveProperty('x-powered-by');
          expect(response.text).toContain('/ops/queues');
        });

      const deadline = Date.now() + 5_000;
      let response = await http.get(lists).auth(username, password);
      while (response.status === 500 && Date.now() < deadline) {
        response = await http.get(lists).auth(username, password);
      }
      expect(response.status).toBe(200);
      expect(response.headers).not.toHaveProperty('x-powered-by');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        queues: [
          { name: 'email-delivery', readOnlyMode: true, counts: { delayed: 1 } },
          { name: 'nightly-maintenance', readOnlyMode: true, counts: { delayed: 0 } },
        ],
      });

      const root = `${lists}/email-delivery`;
      await http.put(`${root}/retry/failed`).auth(username, password).expect(405);
      await http.put(`${root}/clean/completed`).auth(username, password).expect(405);
      await http.put(`${root}/${job.id}/clean`).auth(username, password).expect(405);
      await http.put(`${root}/${job.id}/promote`).auth(username, password).expect(405);
      await http.delete(`${root}/${job.id}`).auth(username, password).expect(405);
      expect(await job.getState()).toBe('delayed');
      expect(await queue.getDelayedCount()).toBe(1);
    } finally {
      await app?.close();
      await producers.onModuleDestroy();
      await fixture.cleanup();
    }
  });
});
