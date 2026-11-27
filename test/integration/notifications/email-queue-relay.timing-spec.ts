import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { EnvironmentVariables } from '../../../src/infrastructure/config/env-schema';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { QueueProducers } from '../../../src/infrastructure/queue/queue-producers';
import { EmailDeliveryApi } from '../../../src/modules/notifications/public/email-delivery.api';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import { OutboxRelayLoop } from '../../../src/worker/outbox-relay.job';
import { createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { keysUnder, redisTestSettings, toggleableRedisProxy, withRedisPrefix } from '../../support/redis-harness';

async function poll(check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the queue relay');
    await delay(15);
  }
}

describe('the email outbox relay over PostgreSQL and Redis', () => {
  let ctx: Awaited<ReturnType<typeof createHttpTestApp>>;
  let runner: TransactionRunner;
  let notifications: NotificationsApi;
  let emailDelivery: EmailDeliveryApi;
  let organizationId: string;
  let redis: Awaited<ReturnType<typeof withRedisPrefix>>;
  let producers: QueueProducers[];
  let relays: OutboxRelayLoop[];

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    ({ organizationId } = await seedInstallation(ctx.app));
    runner = ctx.app.get(TransactionRunner);
    notifications = ctx.app.get(NotificationsApi, { strict: false });
    emailDelivery = ctx.app.get(EmailDeliveryApi, { strict: false });
  }, 90_000);

  beforeEach(async () => {
    redis = await withRedisPrefix();
    producers = [];
    relays = [];
    await ctx.sql.query('DELETE FROM email_outbox');
  });

  afterEach(async () => {
    try {
      for (const relay of relays) await relay.onModuleDestroy();
      for (const producer of producers) await producer.onModuleDestroy();
    } finally {
      await redis.cleanup();
    }
  });

  afterAll(async () => ctx?.close());

  function fixture(port?: number) {
    const settings = redisTestSettings(redis.prefix);
    const config = new ConfigService<EnvironmentVariables, true>({
      QUEUE_RELAY_INTERVAL_MS: 200,
      REDIS_HOST: port === undefined ? settings.host : '127.0.0.1',
      REDIS_PORT: port ?? settings.port,
      REDIS_PASSWORD: settings.password,
      REDIS_USERNAME: settings.username,
      REDIS_TLS: settings.tls,
      REDIS_KEY_PREFIX: settings.keyPrefix,
    });
    const producer = new QueueProducers(config);
    const relay = new OutboxRelayLoop(
      [{ queue: 'email-delivery', dueIds: (limit, now) => emailDelivery.dueIds(limit, now) }],
      producer,
      config,
    );
    producers.push(producer);
    relays.push(relay);
    return { producer, relay, queue: producer.get('email-delivery') };
  }

  const enqueue = (rollback = false) =>
    runner.run(async (tx) => {
      const row = await notifications.enqueueEmail(tx, {
        organizationId,
        recipient: 'relay-fixture@example.test',
        template: 'ACCOUNT_INVITATION',
        locale: 'vi',
        actionTokenHash: null,
        payload: { token: 'fixture' },
      });
      if (rollback) throw new Error('Rollback fixture outbox row');
      return row;
    });

  it('relays a committed row within two ticks, with only its ID, and leaves a rolled back row alone', async () => {
    const { queue, relay } = fixture();
    await poll(async () => (await queue.getBackend().client).status === 'ready', 5_000);
    await expect(enqueue(true)).rejects.toThrow('Rollback fixture outbox row');
    await relay.tick();
    expect(await queue.getWaitingCount()).toBe(0);
    relay.onApplicationBootstrap();
    const row = await enqueue();
    await poll(async () => (await queue.getWaitingCount()) === 1, 400);
    const [job] = await queue.getWaiting();
    expect(job.data).toEqual({ outboxId: row.id });
  });

  it('deduplicates two relays and skips rows that are not due', async () => {
    const first = fixture();
    const second = fixture();
    await poll(async () => (await first.queue.getBackend().client).status === 'ready', 5_000);
    await poll(async () => (await second.queue.getBackend().client).status === 'ready', 5_000);
    const future = await enqueue();
    const inFlight = await enqueue();
    await ctx.sql.query("UPDATE email_outbox SET next_attempt_at = now() + interval '5 minutes' WHERE id = $1", [
      future.id,
    ]);
    await ctx.sql.query(
      "UPDATE email_outbox SET status = 'SENDING', lease_id = $2, lease_expires_at = now() + interval '5 minutes' WHERE id = $1",
      [inFlight.id, randomUUID()],
    );
    for (let tick = 0; tick < 20; tick++) await first.relay.tick();
    expect(await first.queue.getWaitingCount()).toBe(0);
    for (let row = 0; row < 10; row++) await enqueue();
    for (let tick = 0; tick < 20; tick++) await Promise.all([first.relay.tick(), second.relay.tick()]);
    expect(await first.queue.getWaitingCount()).toBe(10);
  });

  it('leaves rows unchanged during Redis loss and relays again on the same queue', async () => {
    const proxy = await toggleableRedisProxy();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await proxy.stop();
      const { producer, relay, queue } = fixture(proxy.port);
      await producer.onApplicationBootstrap();
      const row = await enqueue();
      for (let tick = 0; tick < 30; tick++) {
        const started = Date.now();
        await relay.tick();
        expect(Date.now() - started).toBeLessThan(200);
      }
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 outbox rows'));
      const { rows } = await ctx.sql.query<{ status: string; attempts: number }>(
        'SELECT status, attempts FROM email_outbox WHERE id = $1',
        [row.id],
      );
      const [state] = rows;
      expect(state).toMatchObject({ status: 'PENDING', attempts: 0 });
      await proxy.start();
      await poll(async () => (await queue.getBackend().client).status === 'ready', 5_000);
      await relay.tick();
      expect(await queue.getWaitingCount()).toBe(1);

      const queueKeys = (await keysUnder(redis.admin, redis.prefix)).filter((key) =>
        key.startsWith(`${redis.prefix}:bull:`),
      );
      await redis.admin.del(...queueKeys);
      await relay.tick();
      expect(await queue.getWaitingCount()).toBe(1);
    } finally {
      warn.mockRestore();
      await proxy.close();
    }
  });
});
