import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { Client, type Pool } from 'pg';
import * as pgPool from '../../../src/infrastructure/database/pg-pool';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import {
  TransactionRunner,
  TransientDatabaseError,
  toTransientError,
} from '../../../src/infrastructure/database/transaction-runner';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { PgRelay } from '../../support/pg-relay';
import { testConfig } from '../../support/test-config';
import { AuditRepo } from '../../../src/modules/audit/audit.repo';
import { AuditApi } from '../../../src/modules/audit/public/audit.api';
import { migrateDisposableDatabase } from '../../support/disposable-database';

/**
 * N-1 / R-02 / N-2: a statement that stops being answered on a warm connection that is already in use.
 *
 * Every case reaches the database through PgRelay and holds one statement, so the connection is open
 * and acquired: the outcome cannot come from the connect timeout or from maxWait. The server-side
 * idle-in-transaction timeout is set far above the test's duration so it cannot hide a client-side defect.
 */
const QUERY_TIMEOUT_MS = 2000;
const SLACK_MS = 1500;
const settings = {
  DB_LOCK_TIMEOUT_MS: 500,
  DB_STATEMENT_TIMEOUT_MS: 1500,
  DB_TRANSACTION_TIMEOUT_MS: 4000,
  DB_TRANSACTION_MAX_WAIT_MS: 2000,
  DB_CONNECT_TIMEOUT_MS: 1000,
  DB_QUERY_TIMEOUT_MS: QUERY_TIMEOUT_MS,
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: 120000,
};

describe('a statement that stops being answered on a warm connection (integration)', () => {
  let database: DisposableDatabase;
  let relay: PgRelay;
  let prisma: PrismaService;
  let runner: TransactionRunner;
  let admin: Client;
  /** Every pool PrismaService asked the factory for; the test ends whatever `$disconnect` left open. */
  const pools: Pool[] = [];
  let createPoolSpy: jest.SpyInstance | undefined;

  /**
   * Cleanup only: ends a captured pool that is still open, so a leak caught by an assertion cannot also
   * surface as an unhandled pool 'error' when the relay and the database go away. A pool nobody listens
   * to throws on 'error'; the listener exists for this window only.
   */
  const endLeakedPools = async (): Promise<void> => {
    for (const pool of pools) {
      if (pool.ending || pool.ended) continue;
      pool.on('error', () => undefined);
      await pool.end();
    }
  };

  /** Fails the test (not the query) when the call is still waiting; it proves nothing about cancellation. */
  const within = async <T>(work: Promise<T>, ms: number): Promise<T | 'still waiting'> =>
    Promise.race([work, sleep(ms).then(() => 'still waiting' as const)]);

  const timed = async (work: () => Promise<unknown>): Promise<{ outcome: unknown; elapsed: number }> => {
    const started = Date.now();
    const outcome = await within(
      work().catch((error: unknown) => error),
      QUERY_TIMEOUT_MS * 3,
    );
    return { outcome, elapsed: Date.now() - started };
  };

  const idleInTransaction = async (): Promise<number> => {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'`,
    );
    return rows[0].n;
  };

  const committed = async (): Promise<{ value: number; paired: number }> => {
    const value = (await admin.query<{ v: number }>('SELECT v FROM stall_probe WHERE id = 1')).rows[0].v;
    const paired = (
      await admin.query<{ n: number }>(`SELECT count(*)::int AS n FROM stall_log WHERE note = $1`, [`paired ${value}`])
    ).rows[0].n;
    return { value, paired };
  };

  /** Ordinary traffic on the same pool: short write transactions and bare reads. */
  const laterTraffic = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) {
      await runner.run((tx) => tx.$executeRawUnsafe(`INSERT INTO stall_log (note) VALUES ('later')`));
      await prisma.$queryRaw`SELECT 1`;
    }
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    admin = new Client({ connectionString: database.url });
    await admin.connect();
    await admin.query('CREATE TABLE stall_probe (id int PRIMARY KEY, v int NOT NULL)');
    await admin.query('CREATE TABLE stall_log (id serial PRIMARY KEY, note text NOT NULL)');
    await admin.query('INSERT INTO stall_probe VALUES (1, 0)');
    const direct = new URL(database.url);
    relay = await PgRelay.start(direct.hostname, Number(direct.port || 5432));
    direct.port = String(relay.port);
    const createPostgresPool = pgPool.createPostgresPool;
    createPoolSpy = jest.spyOn(pgPool, 'createPostgresPool').mockImplementation((...args) => {
      const pool = createPostgresPool(...args);
      pools.push(pool);
      return pool;
    });
    prisma = new PrismaService(testConfig({ ...settings, DATABASE_URL: direct.toString() }));
    runner = new TransactionRunner(prisma, testConfig(settings));
    expect(pools).toHaveLength(1); // the spy really intercepted the pool PrismaService built
    await prisma.$queryRaw`SELECT 1`; // warm the pool
  }, 60000);

  afterEach(() => relay.releaseHeld());

  afterAll(async () => {
    relay?.releaseHeld();
    await prisma?.$disconnect();
    await endLeakedPools();
    createPoolSpy?.mockRestore();
    await relay?.stop();
    await admin?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('ends a bare read on an acquired connection at the query timeout, as a transient error', async () => {
    relay.holdWhen(/^SELECT 'stall-read'/);
    const { outcome, elapsed } = await timed(() => prisma.$queryRawUnsafe(`SELECT 'stall-read'`));

    expect(relay.holding).toBe(true); // the statement really was on an open connection
    expect(toTransientError(outcome)).toBeInstanceOf(TransientDatabaseError);
    // Not the connect timeout (1 s) and not maxWait: the query timeout itself ended the call.
    expect(elapsed).toBeGreaterThanOrEqual(QUERY_TIMEOUT_MS - 100);
    expect(elapsed).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS);
  }, 20000);

  it('never commits a transaction whose statement was answered late (N-1)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      relay.holdWhen(/^UPDATE stall_probe/);
      const { outcome, elapsed } = await timed(() =>
        runner.run(async (tx) => {
          await tx.$executeRawUnsafe('UPDATE stall_probe SET v = 1 WHERE id = 1');
          await tx.$executeRawUnsafe(`INSERT INTO stall_log (note) VALUES ('paired 1')`);
        }),
      );

      expect(outcome).toBeInstanceOf(TransientDatabaseError);

      relay.releaseHeld(); // PostgreSQL now receives the UPDATE it never saw
      await laterTraffic();

      // The integrity invariant first: nothing of the failed transaction is ever committed.
      await expect(committed()).resolves.toEqual({ value: 0, paired: 0 });
      expect(await idleInTransaction()).toBe(0);
      // Then the budget: one query timeout, because the retired connection fails the rollback at once
      // instead of waiting a second query timeout for a ROLLBACK that cannot be delivered.
      expect(elapsed).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS);
      // Operators can count retired connections in the log.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('A database connection was retired'));
    } finally {
      warn.mockRestore(); // also when an expectation fails, so later cases keep their log output
    }
  }, 30000);

  it('keeps a transaction whose COMMIT request was held before delivery all-or-nothing', async () => {
    relay.holdWhen(/^COMMIT/);
    const { outcome } = await timed(() =>
      runner.run(async (tx) => {
        await tx.$executeRawUnsafe('UPDATE stall_probe SET v = 2 WHERE id = 1');
        await tx.$executeRawUnsafe(`INSERT INTO stall_log (note) VALUES ('paired 2')`);
      }),
    );

    expect(outcome).toBeInstanceOf(TransientDatabaseError);
    relay.releaseHeld();
    await laterTraffic();

    // This is the original request-direction race: release can beat the peer's close event, so
    // PostgreSQL may receive COMMIT. The separate response-direction case below proves actual commit.
    const state = await committed();
    expect([
      { value: 0, paired: 0 },
      { value: 2, paired: 1 },
    ]).toContainEqual(state);
    expect(await idleInTransaction()).toBe(0);
  }, 30000);

  it('commits business and audit before a lost COMMIT response times out, without retrying the write', async () => {
    const response = relay.holdCommitResponse(QUERY_TIMEOUT_MS * 4);
    const organizationId = '11111111-1111-4111-8111-111111111104';
    const correlationId = 'post-commit-response-loss';
    const audit = new AuditApi(new AuditRepo());
    let attempts = 0;
    let settled = false;
    let transactionPid = 0;
    const started = Date.now();
    const call = runner
      .run(async (tx) => {
        attempts += 1;
        transactionPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
        await tx.organization.create({
          data: { id: organizationId, name: 'Committed probe', timeZone: 'UTC', reportingCurrency: 'USD' },
        });
        await audit.record(tx, {
          organizationId,
          actorKind: 'SYSTEM',
          action: 'PROBE.COMMITTED',
          resourceType: 'Organization',
          resourceId: organizationId,
          after: { name: 'Committed probe' },
          correlationId,
        });
      })
      .then(
        (value) => {
          settled = true;
          return value;
        },
        (error: unknown) => {
          settled = true;
          return error;
        },
      );
    try {
      await response.held; // response-direction event, after COMMIT has been forwarded
      // Independent, direct connection: both actual application tables are already durable while
      // the original caller is still awaiting the withheld response. No timing sleep infers commit.
      const visible = await admin.query<{ business: number; audit: number }>(
        `SELECT (SELECT count(*)::int FROM organizations WHERE id = $1) AS business,
                (SELECT count(*)::int FROM audit_events WHERE correlation_id = $2) AS audit`,
        [organizationId, correlationId],
      );
      expect(visible.rows[0]).toEqual({ business: 1, audit: 1 });
      expect(settled).toBe(false);
      // A second relayed connection must continue serving while the first response is held.
      const independentUrl = new URL(database.url);
      independentUrl.port = String(relay.port);
      const independent = new Client({
        connectionString: independentUrl.toString(),
        connectionTimeoutMillis: 1000,
        query_timeout: 1000,
      });
      try {
        await independent.connect();
        await expect(independent.query('SELECT 1 AS one')).resolves.toMatchObject({ rows: [{ one: 1 }] });
      } finally {
        await independent.end();
      }

      const outcome = await within(call, QUERY_TIMEOUT_MS + SLACK_MS);
      expect(outcome).toBeInstanceOf(TransientDatabaseError);
      const elapsed = Date.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(QUERY_TIMEOUT_MS - 100);
      expect(elapsed).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS);
      expect(attempts).toBe(1);
      response.release();

      const freshPid = (await prisma.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
      expect(freshPid).not.toBe(transactionPid);
      await laterTraffic();
      const final = await admin.query<{ business: number; audit: number }>(
        `SELECT (SELECT count(*)::int FROM organizations WHERE id = $1) AS business,
                (SELECT count(*)::int FROM audit_events WHERE correlation_id = $2) AS audit`,
        [organizationId, correlationId],
      );
      expect(final.rows[0]).toEqual({ business: 1, audit: 1 });
      expect(attempts).toBe(1);
      expect(await idleInTransaction()).toBe(0);
    } finally {
      response.dispose();
      await call; // disposal unblocks a failed assertion's pending caller before teardown
    }
  }, 30000);

  it('rolls back a transaction whose BEGIN was answered after maxWait', async () => {
    relay.holdWhen(/^BEGIN/);
    const { outcome, elapsed } = await timed(() =>
      runner.run((tx) => tx.$executeRawUnsafe('UPDATE stall_probe SET v = 3 WHERE id = 1')),
    );

    expect(outcome).toBeInstanceOf(TransientDatabaseError);
    expect(elapsed).toBeLessThan(settings.DB_TRANSACTION_MAX_WAIT_MS + SLACK_MS);
    relay.releaseHeld();
    await laterTraffic();

    expect((await committed()).value).not.toBe(3);
    expect(await idleInTransaction()).toBe(0);
  }, 30000);

  it('sets the server-side idle-in-transaction backstop on pooled sessions', async () => {
    const rows = await prisma.$queryRaw<{ value: string }[]>`
      SELECT current_setting('idle_in_transaction_session_timeout') AS value`;
    expect(rows[0].value).toBe('2min');
  });

  it('keeps serving and closes every connection on disconnect', async () => {
    await expect(runner.run((tx) => tx.$queryRaw<{ one: number }[]>`SELECT 1 AS one`)).resolves.toEqual([{ one: 1 }]);

    try {
      await prisma.$disconnect();
      // The service owns its pool: after $disconnect no connection of the application is left.
      for (let i = 0; i < 20 && (await appConnections()) > 0; i += 1) await sleep(100);
      expect(await appConnections()).toBe(0);
    } finally {
      await endLeakedPools(); // a failed assertion must not leave a pool that errors during teardown
    }
  }, 20000);

  const appConnections = async (): Promise<number> =>
    (
      await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`,
      )
    ).rows[0].n;
});
