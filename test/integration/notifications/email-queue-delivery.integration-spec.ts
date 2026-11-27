import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Worker, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { SMTPServer } from 'smtp-server';
import type Redis from 'ioredis';
import type { EnvironmentVariables } from '../../../src/infrastructure/config/env-schema';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { QueueProducers } from '../../../src/infrastructure/queue/queue-producers';
import { jobOptionsFor } from '../../../src/infrastructure/queue/queue-registry';
import { QueueWorkerFactory } from '../../../src/infrastructure/queue/queue-worker-factory';
import { createBlockingRedisClient } from '../../../src/infrastructure/redis/redis-client.factory';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { EmailDeliveryApi } from '../../../src/modules/notifications/public/email-delivery.api';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import { EMAIL_JOB_ERROR_CODES, EmailQueueConsumer } from '../../../src/worker/email-queue.job';
import { OutboxRelayLoop } from '../../../src/worker/outbox-relay.job';
import { fakeSmtpEnvironment, listenOnLoopback } from '../../support/fake-smtp';
import { createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { keysUnder, redisTestSettings, withRedisPrefix } from '../../support/redis-harness';

const RECIPIENT = 'mail-fixture@example.test';
const TOKEN = 'fixture-only-private-payload';

@Module({})
class DatabaseShutdownFixture {}

interface OutboxState {
  status: string;
  attempts: number;
  last_error_code: string | null;
  payload_ciphertext: Buffer | null;
}

async function waitUntil(check: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await delay(20);
  }
}

function gate() {
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { reached, release };
}

async function redisValue(redis: Redis, key: string): Promise<unknown> {
  switch (await redis.type(key)) {
    case 'string':
      return redis.get(key);
    case 'hash':
      return redis.hgetall(key);
    case 'list':
      return redis.lrange(key, 0, -1);
    case 'zset':
      return redis.zrange(key, 0, -1);
    case 'stream':
      return redis.xrange(key, '-', '+');
    default:
      return undefined;
  }
}

describe('email delivery through BullMQ, PostgreSQL and SMTP', () => {
  type RedisFixture = Awaited<ReturnType<typeof withRedisPrefix>>;
  type HttpFixture = Awaited<ReturnType<typeof createHttpTestApp>>;
  let db: HttpFixture;
  let redis: RedisFixture;
  let runner: TransactionRunner;
  let notifications: NotificationsApi;
  let email: EmailDeliveryApi;
  let identity: IdentityAccessApi;
  let organizationId: string;
  let smtp: SMTPServer;
  let received: string[];
  let responseCode: 421 | 550 | undefined;
  let holdDelivery: { active: ReturnType<typeof gate>; release: ReturnType<typeof gate> } | undefined;
  let producers: QueueProducers;
  let relay: OutboxRelayLoop;
  let consumer: EmailQueueConsumer;
  let consumerModule: TestingModule | undefined;
  let config: ConfigService<EnvironmentVariables, true>;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      disableReverseLookup: true,
      onRcptTo(_address, _session, done) {
        if (responseCode) {
          done(Object.assign(new Error('Fixture SMTP refusal'), { responseCode }));
        } else {
          done();
        }
      },
      onData(stream, session, done) {
        const hold = holdDelivery;
        holdDelivery = undefined;
        stream.resume();
        stream.once('end', () => {
          const finish = () => {
            received.push(...session.envelope.rcptTo.map((recipient) => recipient.address));
            done();
          };
          if (!hold) {
            finish();
            return;
          }
          hold.active.release();
          void hold.release.reached.then(finish);
        });
      },
    });
    Object.assign(process.env, fakeSmtpEnvironment(await listenOnLoopback(smtp)));
    db = await createHttpTestApp();
    ({ organizationId } = await seedInstallation(db.app));
    runner = db.app.get(TransactionRunner);
    notifications = db.app.get(NotificationsApi, { strict: false });
    email = db.app.get(EmailDeliveryApi, { strict: false });
    identity = db.app.get(IdentityAccessApi, { strict: false });
  }, 90_000);

  beforeEach(async () => {
    redis = await withRedisPrefix();
    const settings = redisTestSettings(redis.prefix);
    config = new ConfigService<EnvironmentVariables, true>({
      REDIS_HOST: settings.host,
      REDIS_PORT: settings.port,
      REDIS_USERNAME: settings.username,
      REDIS_PASSWORD: settings.password,
      REDIS_TLS: settings.tls,
      REDIS_KEY_PREFIX: settings.keyPrefix,
      EMAIL_QUEUE_CONCURRENCY: 2,
      QUEUE_RELAY_INTERVAL_MS: 200,
    });
    producers = new QueueProducers(config);
    relay = new OutboxRelayLoop(
      [{ queue: 'email-delivery', dueIds: (limit, now) => email.dueIds(limit, now) }],
      producers,
      config,
    );
    consumer = new EmailQueueConsumer(new QueueWorkerFactory(config), email, identity, config);
    responseCode = undefined;
    received = [];
    holdDelivery = undefined;
    await db.sql.query('DELETE FROM email_outbox');
    await waitUntil(async () => (await queue().getBackend().client).status === 'ready', 'Redis');
  });

  afterEach(async () => {
    holdDelivery?.release.release();
    try {
      await consumerModule?.close();
      consumerModule = undefined;
      await relay.onModuleDestroy();
      await producers.onModuleDestroy();
    } finally {
      await redis.cleanup();
    }
  });

  afterAll(async () => {
    await db?.close();
    if (smtp) await new Promise<void>((resolve) => smtp.close(() => resolve()));
    process.env = originalEnv;
  });

  const queue = () => producers.get('email-delivery');
  const enqueue = (actionTokenHash: string | null = null) =>
    runner.run((tx) =>
      notifications.enqueueEmail(tx, {
        organizationId,
        recipient: RECIPIENT,
        template: 'ACCOUNT_INVITATION',
        locale: 'vi',
        actionTokenHash,
        payload: { token: TOKEN, fullName: 'Fixture User' },
      }),
    );

  async function rowOf(id: string): Promise<OutboxState> {
    const { rows } = await db.sql.query<OutboxState>(
      'SELECT status, attempts, last_error_code, payload_ciphertext FROM email_outbox WHERE id = $1',
      [id],
    );
    return rows[0];
  }

  async function startConsumer(onDatabaseDestroy = () => undefined): Promise<void> {
    consumerModule = await Test.createTestingModule({
      imports: [
        {
          module: DatabaseShutdownFixture,
          providers: [{ provide: 'database shutdown fixture', useValue: { onModuleDestroy: onDatabaseDestroy } }],
        },
      ],
      providers: [{ provide: EmailQueueConsumer, useValue: consumer }],
    }).compile();
    await consumerModule.init();
  }

  async function waitForJobs(state: 'completed' | 'failed', count: number): Promise<Job[]> {
    await waitUntil(async () => (await queue().getJobCountByTypes(state)) === count, `${count} ${state} jobs`);
    return queue().getJobs([state]);
  }

  it('restores a job after Redis data loss, sends once, and skips a stale job from polling', async () => {
    const mail = await enqueue();
    await relay.tick();
    expect(await queue().getWaitingCount()).toBe(1);
    const queueKeys = await keysUnder(redis.admin, `${redis.prefix}:bull`);
    await redis.admin.del(...queueKeys);
    await relay.tick();
    await startConsumer();
    const [sent] = await waitForJobs('completed', 1);
    expect(sent.returnvalue).toEqual({ outcome: 'SENT' });
    expect(await rowOf(mail.id)).toMatchObject({ status: 'SENT', attempts: 1, payload_ciphertext: null });
    expect(received).toEqual([RECIPIENT]);

    await queue().add('deliver', { outboxId: mail.id }, jobOptionsFor('email-delivery', mail.id));
    const done = await waitForJobs('completed', 2);
    expect(done.some((job) => JSON.stringify(job.returnvalue) === '{"outcome":"NOT_CLAIMED"}')).toBe(true);
    expect(received).toEqual([RECIPIENT]);
  });

  it('cancels a revoked link and maps permanent SMTP, payload and malformed-job failures to safe codes', async () => {
    const cancelled = await enqueue(`missing-${randomUUID()}`);
    const unreadable = await enqueue();
    const refused = await enqueue();
    await db.sql.query("UPDATE email_outbox SET payload_key_id = 'missing-key' WHERE id = $1", [unreadable.id]);
    responseCode = 550;
    const warnings = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await relay.tick();
      await queue().add('unknown', { outboxId: randomUUID() }, jobOptionsFor('email-delivery', randomUUID()));
      await startConsumer();
      const [done] = await waitForJobs('completed', 1);
      const failed = await waitForJobs('failed', 3);
      expect(done.returnvalue).toEqual({ outcome: 'CANCELLED' });
      expect(failed.map((job) => job.failedReason).sort()).toEqual([
        'JOB_DATA_INVALID',
        'PAYLOAD_UNREADABLE',
        'SMTP_5xx',
      ]);
      expect(failed.every((job) => job.attemptsMade === 1 && (job.stacktrace?.length ?? 0) === 0)).toBe(true);
      expect(await rowOf(cancelled.id)).toMatchObject({ status: 'CANCELLED' });
      expect(await rowOf(unreadable.id)).toMatchObject({ status: 'FAILED', last_error_code: 'PAYLOAD_UNREADABLE' });
      expect(await rowOf(refused.id)).toMatchObject({ status: 'FAILED', last_error_code: 'SMTP_550' });
      expect(received).toEqual([]);
      expect(JSON.stringify(warnings.mock.calls)).not.toContain(RECIPIENT);
      const keys = await keysUnder(redis.admin, redis.prefix);
      expect(keys.every((key) => key.startsWith(`${redis.prefix}:bull:`))).toBe(true);
      const values = JSON.stringify(await Promise.all(keys.map((key) => redisValue(redis.admin, key))));
      expect(values).not.toContain(RECIPIENT);
      expect(values).not.toContain(TOKEN);
      expect(failed.every((job) => EMAIL_JOB_ERROR_CODES.some((code) => code === job.failedReason))).toBe(true);
    } finally {
      warnings.mockRestore();
    }
  });

  it('reschedules transient failures in PostgreSQL and preserves the original code on the fifth attempt', async () => {
    responseCode = 421;
    const mail = await enqueue();
    await startConsumer();
    for (let attempt = 1; attempt <= 4; attempt++) {
      await relay.tick();
      const jobs = await waitForJobs('completed', attempt);
      expect(jobs.every((job) => JSON.stringify(job.returnvalue) === '{"outcome":"RESCHEDULED"}')).toBe(true);
      expect(await rowOf(mail.id)).toMatchObject({ status: 'PENDING', attempts: attempt, last_error_code: 'SMTP_421' });
      await db.sql.query('UPDATE email_outbox SET next_attempt_at = now() WHERE id = $1', [mail.id]);
    }
    await relay.tick();
    const [failed] = await waitForJobs('failed', 1);
    expect(failed).toMatchObject({ failedReason: 'ATTEMPTS_EXHAUSTED', attemptsMade: 1 });
    expect(await rowOf(mail.id)).toMatchObject({ status: 'FAILED', attempts: 5, last_error_code: 'SMTP_421' });
    expect(received).toEqual([]);
  });

  it('keeps a live BullMQ lease exclusive against polling and waits for the active SMTP send on close', async () => {
    const first = await enqueue();
    const hold = { active: gate(), release: gate() };
    holdDelivery = hold;
    await relay.tick();
    const destroying = jest.spyOn(consumer, 'onModuleDestroy');
    const databaseDestroyed = jest.fn<undefined, []>();
    try {
      await startConsumer(databaseDestroyed);
      await waitUntil(async () => (await rowOf(first.id)).status === 'SENDING', 'active outbox lease');
      await hold.active.reached;
      const other = await Promise.all(Array.from({ length: 4 }, () => enqueue()));
      await email.dispatchDue(() => Promise.resolve(true));
      const closing = consumerModule!.close();
      const closed = jest.fn();
      void closing.then(closed, () => undefined);
      await waitUntil(() => Promise.resolve(destroying.mock.calls.length > 0), 'worker shutdown hook');
      expect(closed).not.toHaveBeenCalled();
      expect(databaseDestroyed).not.toHaveBeenCalled();
      expect(await rowOf(first.id)).toMatchObject({ status: 'SENDING', attempts: 1 });
      hold.release.release();
      await closing;
      expect(databaseDestroyed).toHaveBeenCalledTimes(1);
      consumerModule = undefined;
      expect(await rowOf(first.id)).toMatchObject({ status: 'SENT', attempts: 1 });
      for (const row of other) expect(await rowOf(row.id)).toMatchObject({ status: 'SENT', attempts: 1 });
      expect(received).toEqual([RECIPIENT, RECIPIENT, RECIPIENT, RECIPIENT, RECIPIENT]);
      await startConsumer();
      await relay.tick();
      expect(await queue().getWaitingCount()).toBe(0);
      expect(received).toHaveLength(5);
    } finally {
      hold.release.release();
      destroying.mockRestore();
    }
  });

  it('keeps the deduplication key while a stalled job is being recovered', async () => {
    const mail = await enqueue();
    await relay.tick();
    const settings = redisTestSettings(redis.prefix);
    const entered = gate();
    const releaseFirst = gate();
    const firstClient = createBlockingRedisClient(settings, 'test-stalled-first');
    const secondClient = createBlockingRedisClient(settings, 'test-stalled-second');
    const prefix = `${redis.prefix}:bull`;
    const first = new Worker(
      'email-delivery',
      async () => {
        entered.release();
        await releaseFirst.reached;
      },
      { connection: firstClient, prefix, lockDuration: 1_000, stalledInterval: 500 },
    );
    const resume = gate();
    let second: Worker | undefined;
    first.on('error', () => undefined);
    try {
      await waitUntil(async () => (await queue().getActiveCount()) === 1, 'job claimed by the first worker');
      await entered.reached;
      await first.close(true);
      releaseFirst.release();
      let recovered = false;
      second = new Worker(
        'email-delivery',
        async (job) => {
          recovered = true;
          await resume.reached;
          return consumer.process(job);
        },
        { connection: secondClient, prefix, lockDuration: 1_000, stalledInterval: 500 },
      );
      second.on('error', () => undefined);
      const dedupKey = `${prefix}:email-delivery:de:${mail.id}`;
      await waitUntil(() => Promise.resolve(recovered), 'stalled job recovered by the second worker');
      for (let tick = 0; tick < 5; tick++) await relay.tick();
      expect(await redis.admin.exists(dedupKey)).toBe(1);
      expect(await queue().getWaitingCount()).toBe(0);
      resume.release();
      await waitForJobs('completed', 1);
      expect(await redis.admin.exists(dedupKey)).toBe(0);
      expect(await rowOf(mail.id)).toMatchObject({ status: 'SENT', attempts: 1 });
      expect(received).toEqual([RECIPIENT]);
    } finally {
      releaseFirst.release();
      resume.release();
      await first.close(true);
      await second?.close();
      firstClient.disconnect();
      secondClient.disconnect();
    }
  });
});
