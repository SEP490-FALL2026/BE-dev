import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo, Server } from 'node:net';
import type { DemoDatasetCommandArguments } from '../../../src/cli/demo-dataset/demo-dataset.arguments';
import { runDemoDataset, type DemoRunOutcome } from '../../../src/cli/demo-dataset/demo-dataset-run';
import type { FetchLike } from '../../../src/cli/demo-dataset/demo-api-client';
import { SHARED_DEMO_V1 } from '../../../src/cli/demo-dataset/fixture/shared-demo-v1';
import { DemoAccountsApi } from '../../../src/modules/installation/public/demo-accounts.api';
import { createHttpTestApp, HttpTestApp, SEED_PASSWORD, seedInstallation } from '../../support/http-test-app';
import { PgRelay } from '../../support/pg-relay';

/**
 * A-04 (RA-08): `ops:demo-dataset` run again and again while its own database connections are slow, as through the SSH
 * tunnel of the local path (runbook, path B) or on a loaded host. The API listens directly on a disposable PostgreSQL; the
 * command's Nest graph (demo accounts, apply lock) reaches the same database through a relay that delays every chunk, with
 * the production transaction budget (`DB_TRANSACTION_TIMEOUT_MS` 10 s). Before A-04 the demo accounts were described and
 * written in one transaction whose work grew with the fixture (about 60 sequential statements to describe 14 accounts on
 * a rerun, about 165 to write them): a 100 ms round trip made the first apply fail with `TransientDatabaseError` (P2028).
 */
describe('ops:demo-dataset reruns over a slow database connection (A-04, real API and PostgreSQL)', () => {
  /** One way; a round trip costs twice this. */
  const ONE_WAY_DELAY_MS = 50;
  /** Generous: one demo account's transaction needs at most about 18; the old single transaction needed about 165. */
  const MAX_STATEMENTS_PER_TRANSACTION = 40;
  const demoAccounts = SHARED_DEMO_V1.people.filter((person) => person.account !== null).length;
  const secrets = { superAdminPassword: SEED_PASSWORD, demoAccountPassword: 'a demo password for the tests' };

  let ctx: HttpTestApp;
  let relay: PgRelay;
  let demo: INestApplicationContext;
  let baseUrl: string;
  let statements: string[] = [];

  const args = (mode: 'plan' | 'apply'): DemoDatasetCommandArguments => ({
    mode,
    fixture: 'shared-demo-v1',
    organization: 'Acme',
    apiUrl: baseUrl,
    operator: 'TEST-A04',
    environment: 'LOCAL_TEST',
    json: false,
  });
  const run = (mode: 'plan' | 'apply', fetch?: FetchLike): Promise<DemoRunOutcome> =>
    runDemoDataset({ args: args(mode), secrets, accounts: demo.get(DemoAccountsApi), fetch });
  const reportOf = (outcome: DemoRunOutcome) => {
    if ('refused' in outcome) throw new Error(`refused: ${outcome.refused}`);
    return outcome.report;
  };

  /** The most statements the command ran between one BEGIN and its COMMIT/ROLLBACK, on its relayed connections. */
  function largestTransaction(seen: readonly string[]): number {
    let largest = 0;
    let open: number | null = null;
    for (const sql of seen) {
      if (/^\s*BEGIN\b/i.test(sql)) open = 0;
      else if (/^\s*(COMMIT|ROLLBACK)\b/i.test(sql)) {
        largest = Math.max(largest, open ?? 0);
        open = null;
      } else if (open !== null) open++;
    }
    return largest;
  }

  async function heldAdvisoryLocks(): Promise<number> {
    const { rows } = await ctx.sql.query<{ n: string }>(
      `WITH k AS (SELECT hashtextextended('demo-dataset:shared-demo-v1:apply', 0) AS v)
       SELECT count(*) AS n FROM pg_locks, k
        WHERE locktype = 'advisory' AND granted AND objsubid = 1
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND classid::bigint = ((k.v >> 32) & 4294967295) AND objid::bigint = (k.v & 4294967295)`,
    );
    return Number(rows[0].n);
  }

  async function demoAccountRows(): Promise<{ accounts: number; created: number }> {
    const accounts = await ctx.sql.query<{ n: string }>(
      `SELECT count(*) AS n FROM app_users WHERE normalized_login_email LIKE '%@ds1.slm-demo.example'`,
    );
    const created = await ctx.sql.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_events WHERE action = 'DEMO_DATASET.ACCOUNT_CREATED' AND operator_reference = $1`,
      ['DEMO_DATASET:shared-demo-v1:TEST-A04'],
    );
    return { accounts: Number(accounts.rows[0].n), created: Number(created.rows[0].n) };
  }

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    await seedInstallation(ctx.app);
    baseUrl = `http://127.0.0.1:${((ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;

    const direct = new URL(ctx.database.url);
    relay = await PgRelay.start(direct.hostname, Number(direct.port || 5432));
    relay.observe((sql) => statements.push(sql));
    const relayed = new URL(ctx.database.url);
    relayed.hostname = '127.0.0.1';
    relayed.port = String(relay.port);
    // The command's graph validates its environment when it is imported: only it connects through the relay.
    const directUrl = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = relayed.toString();
    try {
      const { DemoDatasetCliModule } =
        await import('../../../src/modules/installation/demo-dataset/demo-dataset-cli.module');
      demo = await NestFactory.createApplicationContext(DemoDatasetCliModule, { logger: false });
    } finally {
      process.env.TEST_DATABASE_URL = directUrl;
    }
  }, 300000);

  afterAll(async () => {
    await demo?.close();
    await relay?.stop();
    await ctx?.close();
  });

  beforeEach(() => {
    statements = [];
    relay.delay(ONE_WAY_DELAY_MS);
  });

  afterEach(() => relay.delay(0));

  it('applies the whole dataset with a 100 ms round trip, each transaction bounded whatever the fixture size', async () => {
    const first = reportOf(await run('apply'));

    expect(first.steps.filter((step) => step.status !== 'done' && step.status !== 'present')).toEqual([]);
    expect(first.exitCode).toBe(0);
    expect(statements.length).toBeGreaterThan(demoAccounts * 4);
    expect(largestTransaction(statements)).toBeLessThanOrEqual(MAX_STATEMENTS_PER_TRANSACTION);
    expect(await demoAccountRows()).toEqual({ accounts: demoAccounts, created: demoAccounts });
    expect(await heldAdvisoryLocks()).toBe(0);
  }, 600000);

  it('runs again twice over the same slow connection: nothing to change, nothing written twice, no lock left', async () => {
    for (const attempt of [2, 3]) {
      statements = [];
      const again = reportOf(await run('apply'));

      expect({
        attempt,
        exitCode: again.exitCode,
        notPresent: again.steps.filter((s) => s.status !== 'present'),
      }).toEqual({ attempt, exitCode: 2, notPresent: [] });
      expect(largestTransaction(statements)).toBeLessThanOrEqual(MAX_STATEMENTS_PER_TRANSACTION);
      expect(await demoAccountRows()).toEqual({ accounts: demoAccounts, created: demoAccounts });
      expect(await heldAdvisoryLocks()).toBe(0);
    }
  }, 600000);

  it('keeps the report of a run whose lock connection broke half-way (the server already released the lock)', async () => {
    relay.delay(0);
    let terminated = false;
    // After the target is proven and the lock taken, the first read of a step: the lock's session is ended server-side.
    const breakLock: FetchLike = async (url, init) => {
      if (!terminated && url.includes('/departments')) {
        terminated = true;
        await ctx.sql.query(
          `SELECT pg_terminate_backend(l.pid) FROM pg_locks l
            WHERE l.locktype = 'advisory' AND l.granted AND l.pid <> pg_backend_pid()
              AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
        );
      }
      return fetch(url, init);
    };

    const outcome = await run('apply', breakLock);

    expect(terminated).toBe(true);
    expect(reportOf(outcome).exitCode).toBe(2);
    expect(await heldAdvisoryLocks()).toBe(0);
  }, 300000);
});
