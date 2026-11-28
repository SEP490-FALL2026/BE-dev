import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { EnvironmentVariables } from '../../../src/infrastructure/config/env-schema';
import { QueueProducers } from '../../../src/infrastructure/queue/queue-producers';
import { QueueWorkerFactory } from '../../../src/infrastructure/queue/queue-worker-factory';
import { ActionTokenRepo } from '../../../src/modules/identity-access/accounts/action-token.repo';
import { SessionRepo } from '../../../src/modules/identity-access/auth/session.repo';
import { AuthHousekeepingApi } from '../../../src/modules/identity-access/public/auth-housekeeping.api';
import { EmailDeliveryApi } from '../../../src/modules/notifications/public/email-delivery.api';
import { BOOT_RUN_DEDUP, NightlyMaintenanceScheduler } from '../../../src/worker/nightly-maintenance.job';
import { NightlyMaintenanceRunner } from '../../../src/worker/nightly-maintenance.runner';
import { createHttpTestApp, seedInstallation, type HttpTestApp } from '../../support/http-test-app';
import { redisTestSettings, toggleableRedisProxy, withRedisPrefix } from '../../support/redis-harness';

async function waitUntil(condition: () => boolean | Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await condition())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await delay(20);
  }
}

describe('nightly maintenance over PostgreSQL and Redis', () => {
  let ctx: HttpTestApp;
  let organizationId: string;
  let userId: string;
  let runner: NightlyMaintenanceRunner;
  const now = new Date('2026-11-27T17:00:00.000Z');
  const older = '2026-10-28T16:59:00.000Z';
  const newer = '2026-10-28T17:01:00.000Z';
  const recipient = 'maintenance-fixture@example.test';

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    const seeded = await seedInstallation(ctx.app);
    organizationId = seeded.organizationId;
    userId = seeded.superAdmin.appUserId;
    runner = new NightlyMaintenanceRunner(
      ctx.app.get(EmailDeliveryApi),
      new AuthHousekeepingApi(ctx.app.get(SessionRepo), ctx.app.get(ActionTokenRepo)),
      new ConfigService<EnvironmentVariables, true>({ DATABASE_URL: ctx.database.url }),
    );
  }, 90_000);

  afterAll(async () => ctx?.close());

  async function addFinishedMail(status: 'SENT' | 'FAILED' | 'CANCELLED', updatedAt: string): Promise<string> {
    const id = randomUUID();
    await ctx.sql.query(
      `INSERT INTO email_outbox (id, organization_id, recipient, template, locale, status, next_attempt_at, updated_at)
       VALUES ($1, $2, $3, 'ACCOUNT_INVITATION', 'vi', $4, $5, $5)`,
      [id, organizationId, recipient, status, updatedAt],
    );
    return id;
  }

  it('purges only expired records in batches, retains the latest invitation and is idempotent', async () => {
    const oldEmail = await addFinishedMail('SENT', older);
    const newEmail = await addFinishedMail('FAILED', newer);
    const dead = randomUUID();
    const recent = randomUUID();
    const alive = randomUUID();
    await ctx.sql.query(
      `INSERT INTO auth_sessions (id, app_user_id, idle_expires_at, absolute_expires_at) VALUES
       ($1, $4, $5, $7), ($2, $4, $6, $7), ($3, $4, $7, $7)`,
      [dead, recent, alive, userId, older, newer, now],
    );
    await ctx.sql.query(
      `INSERT INTO refresh_tokens (token_hash, session_id, expires_at)
       SELECT 'maintenance-' || n, $1, $2 FROM generate_series(1, 1200) AS n`,
      [dead, older],
    );
    await ctx.sql.query(
      `INSERT INTO refresh_tokens (token_hash, session_id, expires_at) VALUES ('live-session-token', $1, $2)`,
      [alive, older],
    );
    await ctx.sql.query(
      `INSERT INTO account_action_tokens (token_hash, app_user_id, purpose, expires_at, consumed_at, created_at)
       VALUES ('old-invite', $1, 'INVITE', '2026-09-01', '2026-09-01', '2026-08-31'),
              ('latest-invite', $1, 'INVITE', '2026-09-15', NULL, '2026-09-14'),
              ('old-reset', $1, 'RESET_PASSWORD', $2, $2, '2026-10-01'),
              ('new-reset', $1, 'RESET_PASSWORD', $3, NULL, '2026-10-01')`,
      [userId, older, newer],
    );
    await ctx.sql.query(
      `INSERT INTO login_throttles (organization_id, email_key_hash, window_started_at, blocked_until)
       VALUES ($1, 'old', '2026-11-26T16:59:00Z', NULL),
              ($1, 'recent', '2026-11-26T17:01:00Z', NULL),
              ($1, 'blocked', '2026-11-26T16:59:00Z', '2026-11-27T17:01:00Z')`,
      [organizationId],
    );
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      await expect(runner.run(now)).resolves.toEqual({
        tasks: [
          { name: 'finished-email', deleted: 1, moreRemain: false, failed: false },
          { name: 'dead-sessions', deleted: 1_201, moreRemain: false, failed: false },
          { name: 'spent-action-tokens', deleted: 2, moreRemain: false, failed: false },
          { name: 'idle-login-throttles', deleted: 1, moreRemain: false, failed: false },
        ],
      });
      expect(JSON.stringify(log.mock.calls)).toContain('deleted 1201');
      for (const identifier of [recipient, oldEmail, dead, userId]) {
        expect(JSON.stringify(log.mock.calls)).not.toContain(identifier);
      }
    } finally {
      log.mockRestore();
    }
    expect(
      (await ctx.sql.query('SELECT id FROM email_outbox WHERE id = ANY($1::uuid[])', [[oldEmail, newEmail]])).rows,
    ).toEqual([{ id: newEmail }]);
    expect(
      (await ctx.sql.query('SELECT id FROM auth_sessions WHERE id = ANY($1::uuid[])', [[dead, recent, alive]])).rows,
    ).toEqual(expect.arrayContaining([{ id: recent }, { id: alive }]));
    expect((await ctx.sql.query('SELECT id FROM auth_sessions WHERE id = $1', [dead])).rowCount).toBe(0);
    expect(
      (await ctx.sql.query('SELECT token_hash FROM refresh_tokens WHERE session_id IN ($1, $2)', [dead, alive])).rows,
    ).toEqual([{ token_hash: 'live-session-token' }]);
    expect(
      (
        await ctx.sql.query('SELECT token_hash FROM account_action_tokens WHERE app_user_id = $1 ORDER BY token_hash', [
          userId,
        ])
      ).rows,
    ).toEqual([{ token_hash: 'latest-invite' }, { token_hash: 'new-reset' }]);
    expect(
      (
        await ctx.sql.query(
          'SELECT email_key_hash FROM login_throttles WHERE organization_id = $1 ORDER BY email_key_hash',
          [organizationId],
        )
      ).rows,
    ).toEqual([{ email_key_hash: 'blocked' }, { email_key_hash: 'recent' }]);
    const again = await runner.run(now);
    expect(again).toEqual({
      tasks: ['finished-email', 'dead-sessions', 'spent-action-tokens', 'idle-login-throttles'].map((name) => ({
        name,
        deleted: 0,
        moreRemain: false,
        failed: false,
      })),
    });
  });

  it('recovers registration after Redis starts and deduplicates a later boot after completion', async () => {
    const redis = await withRedisPrefix();
    const proxy = await toggleableRedisProxy();
    const settings = redisTestSettings(redis.prefix);
    const config = new ConfigService<EnvironmentVariables, true>({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: proxy.port,
      REDIS_USERNAME: settings.username,
      REDIS_PASSWORD: settings.password,
      REDIS_TLS: settings.tls,
      REDIS_KEY_PREFIX: settings.keyPrefix,
    });
    const producers = new QueueProducers(config);
    const workers = new QueueWorkerFactory(config);
    const first = new NightlyMaintenanceScheduler(producers, workers, runner, { bootDelayMs: 20, retryDelayMs: 50 });
    const second = new NightlyMaintenanceScheduler(producers, workers, runner, { bootDelayMs: 20, retryDelayMs: 50 });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const oldMail = await addFinishedMail('CANCELLED', new Date(Date.now() - 31 * 86_400_000).toISOString());
      await proxy.stop();
      expect(first.onApplicationBootstrap()).toBeUndefined();
      await waitUntil(
        () => warn.mock.calls.some(([message]) => String(message).includes('registration will retry')),
        'retry',
      );
      await proxy.start();
      const queue = producers.get('nightly-maintenance');
      await waitUntil(async () => (await queue.getBackend().client).status === 'ready', 'Redis');
      await waitUntil(async () => (await queue.getCompletedCount()) === 1, 'startup run');
      expect((await ctx.sql.query('SELECT id FROM email_outbox WHERE id = $1', [oldMail])).rowCount).toBe(0);
      const added = jest.spyOn(queue, 'add');
      second.onApplicationBootstrap();
      await waitUntil(() => added.mock.calls.length === 1, 'second boot enqueue');
      await expect(added.mock.results[0].value).resolves.toBeDefined();
      expect(await queue.getJobSchedulers()).toEqual([
        expect.objectContaining({ key: 'nightly-maintenance', pattern: '0 0 * * *', tz: 'Asia/Ho_Chi_Minh' }),
      ]);
      expect(await queue.getDeduplicationJobId(BOOT_RUN_DEDUP.id)).toBe((await queue.getCompleted())[0].id);
      expect(await queue.getJobCounts('completed', 'delayed', 'waiting', 'active')).toEqual({
        completed: 1,
        delayed: 1,
        waiting: 0,
        active: 0,
      });
    } finally {
      warn.mockRestore();
      await Promise.all([first.onModuleDestroy(), second.onModuleDestroy()]);
      await producers.onModuleDestroy();
      await proxy.close();
      await redis.cleanup();
    }
  });
});
