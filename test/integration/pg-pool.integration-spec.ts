import { setTimeout as sleep } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client, type Pool, type PoolConfig } from 'pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createPostgresPool } from '../../src/infrastructure/database/pg-pool';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { PgRelay } from '../support/pg-relay';

/**
 * The pool behind Prisma (createPostgresPool) and the Prisma adapter, together, through a relay that can
 * go silent. Each case builds its own pool, so the pool events it records belong to that case only.
 * (The service-level behaviour of N-1 is in database-stall.integration-spec.ts.)
 */
const QUERY_TIMEOUT_MS = 1000;

interface PoolEvent {
  type: 'acquire' | 'release' | 'remove';
  pid: number | null;
}

describe('createPostgresPool with the Prisma adapter (integration)', () => {
  let database: DisposableDatabase;
  let relay: PgRelay;
  let admin: Client;
  let relayUrl: string;
  // An unhandled rejection or uncaught exception raised during a test fails that test: Jest (jest-circus)
  // handles them on the real process, so no listener is needed here (a listener on the sandboxed `process` never fires).
  const cleanups: Array<() => Promise<void>> = [];

  interface App {
    pool: Pool;
    prisma: PrismaClient;
    events: PoolEvent[];
    poolErrors: unknown[];
    retired: () => number;
    /** Process ids of the connections that were acquired from index `from` of the event log on. */
    acquiredSince: (from: number) => Array<number | null>;
  }

  const buildApp = (extra: Partial<PoolConfig> = {}, url: string = relayUrl): App => {
    const events: PoolEvent[] = [];
    const poolErrors: unknown[] = [];
    let retired = 0;
    const pool = createPostgresPool(
      {
        connectionString: url,
        options: '-c TimeZone=UTC',
        connectionTimeoutMillis: 5000,
        query_timeout: QUERY_TIMEOUT_MS,
        ...extra,
      },
      { onRetire: () => void (retired += 1) },
    );
    for (const type of ['acquire', 'release', 'remove'] as const) {
      pool.on(type as 'acquire', (...args: unknown[]) => {
        const client = args[args.length - 1] as { processID: number | null };
        events.push({ type, pid: client.processID });
      });
    }
    pool.on('error', (error) => void poolErrors.push(error));
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
    cleanups.push(async () => {
      await prisma.$disconnect().catch(() => undefined);
      await pool.end().catch(() => undefined); // a pool that never went through Prisma
    });
    return {
      pool,
      prisma,
      events,
      poolErrors,
      retired: () => retired,
      acquiredSince: (from) =>
        events
          .slice(from)
          .filter((e) => e.type === 'acquire')
          .map((e) => e.pid),
    };
  };

  const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 5000): Promise<void> => {
    for (const start = Date.now(); Date.now() - start < ms;) {
      if (await condition()) return;
      await sleep(50);
    }
  };

  const backendExists = async (pid: number): Promise<boolean> =>
    (await admin.query<{ n: number }>('SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1', [pid])).rows[0]
      .n > 0;

  const appBackends = async (): Promise<number> =>
    (
      await admin.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
      )
    ).rows[0].n;

  const probeValue = async (): Promise<number> =>
    (await admin.query<{ v: number }>('SELECT v FROM stall_probe WHERE id = 1')).rows[0].v;

  const noteCount = async (note: string): Promise<number> =>
    (await admin.query<{ n: number }>('SELECT count(*)::int AS n FROM stall_log WHERE note = $1', [note])).rows[0].n;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    admin = new Client({ connectionString: database.url });
    await admin.connect();
    await admin.query('CREATE TABLE stall_probe (id int PRIMARY KEY, v int NOT NULL)');
    await admin.query('CREATE TABLE stall_log (id serial PRIMARY KEY, note text NOT NULL)');
    await admin.query('INSERT INTO stall_probe VALUES (1, 0)');
    const direct = new URL(database.url);
    relay = await PgRelay.start(direct.hostname, Number(direct.port || 5432));
    direct.port = String(relay.port);
    relayUrl = direct.toString();
  }, 60000);

  afterEach(async () => {
    relay.resume();
    relay.releaseHeld();
    for (const cleanup of cleanups.splice(0)) await cleanup();
    await admin.query('UPDATE stall_probe SET v = 0 WHERE id = 1');
    await admin.query('DELETE FROM stall_log');
  });

  afterAll(async () => {
    relay?.releaseHeld();
    await relay?.stop();
    await admin?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('I1: removes a connection retired on a timeout for good, and counts it once', async () => {
    const app = buildApp();
    // P29-N6: two connections are open and idle before the stall, the victim and the one every later query runs on, so
    // no new backend has to start inside the window the client-side timeout measures (under load that start alone can
    // exceed it). Both are held at once, so the pool really opens two.
    const warmed = await Promise.all([app.pool.connect(), app.pool.connect()]);
    for (const client of warmed) client.release();
    const open = warmed.map((client) => (client as unknown as { processID: number | null }).processID);
    const mark = app.events.length;
    // The victim leaves the pool when Prisma hands it back, some time after the error reaches the caller: an event.
    const removed = new Promise<number | null>((resolve) =>
      app.pool.once('remove', (client) => resolve((client as unknown as { processID: number | null }).processID)),
    );
    relay.holdWhen(/^UPDATE stall_probe/);

    const outcome = await app.prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('UPDATE stall_probe SET v = 1 WHERE id = 1');
          await tx.$executeRawUnsafe(`INSERT INTO stall_log (note) VALUES ('paired 1')`);
        },
        { timeout: 10000, maxWait: 2000 },
      )
      .catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect(relay.holding).toBe(true);

    const [victim] = app.acquiredSince(mark);
    expect(typeof victim).toBe('number');
    expect(open).toContain(victim);
    const warm = open.find((pid) => pid !== victim);
    relay.releaseHeld(); // PostgreSQL now receives the UPDATE it never saw
    expect(await removed).toBe(victim);
    const later = app.events.length;
    for (let i = 0; i < 6; i += 1) {
      await app.prisma.$executeRawUnsafe(`INSERT INTO stall_log (note) VALUES ('later')`);
      await app.prisma.$queryRaw`SELECT 1`;
    }
    // Every later query ran on the connection that was already open: never the victim, never a new backend.
    expect([...new Set(app.acquiredSince(later))]).toEqual([warm]);

    await waitFor(async () => !(await backendExists(victim as number)));
    expect(app.events.filter((e) => e.type === 'remove').map((e) => e.pid)).toContain(victim);
    expect(app.acquiredSince(mark).slice(1)).not.toContain(victim);
    expect(await backendExists(victim as number)).toBe(false);
    expect(app.retired()).toBe(1);
    expect(await probeValue()).toBe(0);
    expect(await noteCount('paired 1')).toBe(0);
  }, 20000);

  it('I3: parameters and named prepared statements work through the wrapped client', async () => {
    const app = buildApp();

    const rows = await app.prisma.$queryRaw<{ v: number }[]>`SELECT unnest(${[3, 1, 2]}::int[]) AS v ORDER BY 1`;
    expect(rows.map((row) => row.v)).toEqual([1, 2, 3]);

    const client = await app.pool.connect();
    const pid = (client as unknown as { processID: number }).processID;
    try {
      const named = { name: 's1', text: 'SELECT $1::int AS v', values: [1] };
      expect((await client.query(named)).rows).toEqual([{ v: 1 }]);
      expect((await client.query(named)).rows).toEqual([{ v: 1 }]); // the second call reuses the prepared statement
      expect((await client.query({ ...named, values: [7] })).rows).toEqual([{ v: 7 }]);
    } finally {
      client.release();
    }

    expect(app.retired()).toBe(0);
    expect(app.events.filter((e) => e.type === 'remove' && e.pid === pid)).toEqual([]);
  }, 20000);

  it('I7: retires each timed-out connection once when several statements stall at once', async () => {
    const app = buildApp({ max: 3 });
    await Promise.all([1, 2, 3].map(() => app.prisma.$queryRaw`SELECT pg_sleep(0.3)::text AS s`)); // warm: three connections
    const warm = [...new Set(app.acquiredSince(0))];
    expect(warm).toHaveLength(3);

    relay.pause();
    const reads = Array.from({ length: 5 }, (_, i) =>
      app.prisma.$queryRawUnsafe(`SELECT 'stalled ${i}'`).then(
        () => 'ok',
        () => 'failed',
      ),
    );
    await waitFor(() => app.retired() >= 3, QUERY_TIMEOUT_MS * 4);
    const mark = app.events.length;
    relay.resume(); // the two statements that waited for a connection get fresh ones
    const outcomes = await Promise.all(reads);

    expect(outcomes.filter((outcome) => outcome === 'failed')).toHaveLength(3);
    expect(outcomes.filter((outcome) => outcome === 'ok')).toHaveLength(2);
    await waitFor(() => app.events.filter((e) => e.type === 'remove').length >= 3);
    expect(app.retired()).toBe(3); // once per timed-out connection, not once per timed-out statement
    expect(
      app.events
        .filter((e) => e.type === 'remove')
        .map((e) => e.pid)
        .sort(),
    ).toEqual([...warm].sort());
    expect(app.acquiredSince(mark).filter((pid) => warm.includes(pid))).toEqual([]);
    for (let i = 0; i < 4; i += 1) await expect(app.prisma.$queryRaw`SELECT 1 AS one`).resolves.toEqual([{ one: 1 }]);
    expect(app.acquiredSince(mark).filter((pid) => warm.includes(pid))).toEqual([]);
  }, 20000);

  it('I9: disconnecting twice is quiet and leaves no backend of the application', async () => {
    const app = buildApp({}, database.url);
    await Promise.all([1, 2, 3].map(() => app.prisma.$queryRaw`SELECT pg_sleep(0.2)::text AS s`));
    expect(await appBackends()).toBeGreaterThanOrEqual(3);

    await app.prisma.$disconnect();
    await expect(app.prisma.$disconnect()).resolves.toBeUndefined();
    await waitFor(async () => (await appBackends()) === 0);
    await sleep(100);

    expect(await appBackends()).toBe(0);
    expect(app.poolErrors).toEqual([]);
  }, 20000);

  it('I10: a transaction that fails normally rolls back without retiring anything', async () => {
    const app = buildApp({}, database.url);
    await app.prisma.$queryRaw`SELECT 1`; // warm: one connection
    const mark = app.events.length;

    await expect(
      app.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`INSERT INTO stall_log (note) VALUES ('neg')`);
        throw new Error('the work failed');
      }),
    ).rejects.toThrow('the work failed');
    const [used] = app.acquiredSince(mark);
    for (let i = 0; i < 4; i += 1) await app.prisma.$queryRaw`SELECT 1`;

    expect(await noteCount('neg')).toBe(0);
    expect(app.retired()).toBe(0);
    expect(app.events.filter((e) => e.type === 'remove')).toEqual([]);
    expect(app.acquiredSince(mark).slice(1)).toContain(used); // the same connection serves later traffic
  }, 20000);

  it('I11: a connection released inside a transaction is removed, never reused, and rolled back', async () => {
    const app = buildApp({}, database.url);
    const client = await app.pool.connect();
    const pid = (client as unknown as { processID: number }).processID;
    await client.query('BEGIN');
    await client.query(`INSERT INTO stall_log (note) VALUES ('leaked')`);
    expect(client.getTransactionStatus()).toBe('T');
    const mark = app.events.length;

    client.release(); // without COMMIT or ROLLBACK

    await waitFor(() => app.events.slice(mark).some((e) => e.type === 'remove' && e.pid === pid));
    expect(app.events.slice(mark).filter((e) => e.type === 'remove' && e.pid === pid)).toHaveLength(1);
    expect(app.pool.totalCount).toBe(0);
    for (let i = 0; i < 4; i += 1) await app.pool.query('SELECT 1');
    expect(app.acquiredSince(mark)).not.toContain(pid);
    await waitFor(async () => !(await backendExists(pid)));
    expect(await backendExists(pid)).toBe(false);
    expect(await noteCount('leaked')).toBe(0); // the server rolled the open transaction back
    expect(app.retired()).toBe(1);
    expect(app.poolErrors).toEqual([]);
  }, 20000);
});
