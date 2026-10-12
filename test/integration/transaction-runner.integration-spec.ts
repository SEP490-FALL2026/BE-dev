import { Client } from 'pg';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TransactionRunner, TransientDatabaseError } from '../../src/infrastructure/database/transaction-runner';
import { testConfig } from '../support/test-config';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

describe('TransactionRunner (integration)', () => {
  let database: DisposableDatabase;
  let prisma: PrismaService;
  let runner: TransactionRunner;
  let holder: Client;

  const config = (overrides: Record<string, number> = {}) =>
    testConfig({
      DB_LOCK_TIMEOUT_MS: 500,
      DB_STATEMENT_TIMEOUT_MS: 1500,
      DB_TRANSACTION_TIMEOUT_MS: 4000,
      DB_TRANSACTION_MAX_WAIT_MS: 2000,
      ...overrides,
    });

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    prisma = new PrismaService(testConfig({ DATABASE_URL: database.url }));
    runner = new TransactionRunner(prisma, config());
    holder = new Client({ connectionString: database.url });
    await holder.connect();
  }, 60000);

  afterAll(async () => {
    await holder?.end();
    await prisma?.$disconnect();
    if (database) await dropDisposableDatabase(database);
  });

  it('commits the work and returns its result', async () => {
    const result = await runner.run(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE runner_probe (n int)`;
      return 42;
    });
    expect(result).toBe(42);
  });

  it('applies the lock and statement timeouts to the transaction only', async () => {
    const inside = await runner.run(
      (tx) =>
        tx.$queryRaw<{ lock: string; statement: string }[]>`
        SELECT current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement`,
    );
    expect(inside[0]).toEqual({ lock: '500ms', statement: '1500ms' });

    // The setting must not leak to the pooled connection used by the next caller.
    const outside = await prisma.$queryRaw<{ lock: string }[]>`SELECT current_setting('lock_timeout') AS lock`;
    expect(outside[0].lock).toBe('0');
  });

  it('rolls everything back when the work throws', async () => {
    await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS runner_rollback (n int)`;
    await expect(
      runner.run(async (tx) => {
        await tx.$executeRaw`INSERT INTO runner_rollback VALUES (1)`;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT n FROM runner_rollback`;
    expect(rows).toHaveLength(0);
  });

  it('commits a returned failure result instead of rolling back', async () => {
    await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS runner_result (n int)`;
    const outcome = await runner.run(async (tx) => {
      await tx.$executeRaw`INSERT INTO runner_result VALUES (7)`;
      return { kind: 'replay' as const };
    });
    expect(outcome.kind).toBe('replay');
    const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT n FROM runner_result`;
    expect(rows).toHaveLength(1);
  });

  it('maps a lock timeout (55P03) to a transient error', async () => {
    await holder.query('CREATE TABLE IF NOT EXISTS runner_lock (id int PRIMARY KEY)');
    await holder.query('INSERT INTO runner_lock VALUES (1) ON CONFLICT DO NOTHING');
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM runner_lock WHERE id = 1 FOR UPDATE');
    try {
      await expect(
        runner.run((tx) => tx.$queryRaw`SELECT id FROM runner_lock WHERE id = 1 FOR UPDATE`),
      ).rejects.toMatchObject({ name: 'TransientDatabaseError', sqlState: '55P03' });
    } finally {
      await holder.query('ROLLBACK');
    }
  });

  it('maps a statement timeout (57014) to a transient error', async () => {
    await expect(runner.run((tx) => tx.$queryRaw`SELECT pg_sleep(3)`)).rejects.toMatchObject({
      name: 'TransientDatabaseError',
      sqlState: '57014',
    });
  });

  it('maps a deadlock (40P01) to a transient error', async () => {
    const a = new Client({ connectionString: database.url });
    const b = new Client({ connectionString: database.url });
    await a.connect();
    await b.connect();
    await holder.query('CREATE TABLE IF NOT EXISTS runner_dead (id int PRIMARY KEY)');
    await holder.query('INSERT INTO runner_dead VALUES (1), (2) ON CONFLICT DO NOTHING');
    try {
      await a.query('BEGIN');
      await a.query('SELECT 1 FROM runner_dead WHERE id = 1 FOR UPDATE');
      const slow = new TransactionRunner(prisma, config({ DB_LOCK_TIMEOUT_MS: 3000, DB_STATEMENT_TIMEOUT_MS: 3500 }));
      const viaRunner = slow
        .run(async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM runner_dead WHERE id = 2 FOR UPDATE`;
          await tx.$queryRaw`SELECT 1 FROM runner_dead WHERE id = 1 FOR UPDATE`;
        })
        .catch((error: unknown) => error);
      // Wait until the runner's transaction holds row 2 and is blocked on row 1.
      for (let i = 0; i < 50; i += 1) {
        const { rows } = await holder.query("SELECT 1 FROM pg_locks WHERE NOT granted AND locktype = 'transactionid'");
        if (rows.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const closing = a.query('SELECT 1 FROM runner_dead WHERE id = 2 FOR UPDATE').catch((error: unknown) => error);
      const [runnerOutcome, aOutcome] = await Promise.all([viaRunner, closing]);
      const sides = [runnerOutcome, aOutcome];
      // PostgreSQL picks one victim; either the runner is the victim (mapped) or the raw client is.
      const mapped = sides.find((outcome) => outcome instanceof TransientDatabaseError);
      const rawVictim = sides.find((outcome) => (outcome as { code?: string })?.code === '40P01');
      expect(Boolean(mapped) || Boolean(rawVictim)).toBe(true);
      if (mapped) expect(mapped.sqlState).toBe('40P01');
    } finally {
      await a.query('ROLLBACK').catch(() => undefined);
      await a.end();
      await b.end();
    }
  });

  it('maps Prisma P2028 (transaction closed by Prisma) to a transient error', async () => {
    const short = new TransactionRunner(
      prisma,
      config({ DB_LOCK_TIMEOUT_MS: 100, DB_STATEMENT_TIMEOUT_MS: 5000, DB_TRANSACTION_TIMEOUT_MS: 500 }),
    );
    // Two quick statements with an app-side pause exceed Prisma's transaction timeout.
    await expect(
      short.run(async (tx) => {
        await tx.$queryRaw`SELECT 1`;
        await new Promise((resolve) => setTimeout(resolve, 800));
        await tx.$queryRaw`SELECT 2`;
      }),
    ).rejects.toBeInstanceOf(TransientDatabaseError);
  });
});
