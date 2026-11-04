import { INSTALLATION } from '../../../src/cli/seed/fixture/shared-demo-v2/installation';
import { InstallationApi } from '../../../src/modules/installation/public/installation.api';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo, Server } from 'node:net';
import type { SeedCommandArguments } from '../../../src/cli/seed/seed.arguments';
import { runSeed, type DemoRunOutcome } from '../../../src/cli/seed/seed-run';
import { DemoAccountsApi } from '../../../src/modules/installation/public/demo-accounts.api';
import { createHttpTestApp, HttpTestApp, SEED_PASSWORD } from '../../support/http-test-app';

/**
 * `pnpm ops:seed` at the edges of the year, on a controlled clock: only `Date` is faked (the API and the command
 * share this process, so both read the same business day); timers stay real so the database driver and the HTTP stack
 * work as usual. The database keeps its own clock, which no rule of the scenarios reads.
 */
describe('ops:seed at the edges of the year (integration, real API and PostgreSQL, controlled date)', () => {
  let ctx: HttpTestApp;
  let demo: INestApplicationContext;
  let baseUrl: string;
  const secrets = { superAdminPassword: SEED_PASSWORD, demoAccountPassword: 'a demo password for the tests' };
  const at = (instant: string) => jest.setSystemTime(new Date(instant));

  const run = (mode: 'plan' | 'apply') =>
    runSeed({
      args: {
        mode,
        fixture: 'shared-demo-v2',
        apiUrl: baseUrl,
        operator: 'TEST-CALENDAR',
        environment: 'LOCAL_TEST',
        json: false,
        allowBootstrap: false,
        secretsStdin: true,
      } satisfies SeedCommandArguments,
      secrets,
      accounts: demo.get(DemoAccountsApi),
    });
  const refusalOf = (outcome: DemoRunOutcome): string => ('refused' in outcome ? outcome.refused : 'not refused');

  async function businessRows(): Promise<Record<string, number>> {
    const { rows } = await ctx.sql.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('_prisma_migrations', 'auth_sessions', 'refresh_tokens', 'login_throttles', 'audit_events')`,
    );
    const counts: Record<string, number> = {};
    for (const { table_name: table } of rows) {
      counts[table] = Number((await ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
    }
    return counts;
  }

  async function requestStates(): Promise<Record<string, string>> {
    const { rows } = await ctx.sql.query<{ marker: string; state: string }>(
      `SELECT substring(coalesce(p.purpose, r.business_reason) from '^\\[DS1-(R[0-9]+)\\]') AS marker, r.state::text AS state
         FROM access_requests r LEFT JOIN access_request_proposals p ON p.request_id = r.id
        WHERE coalesce(p.purpose, r.business_reason) LIKE '[DS1-R%'`,
    );
    return Object.fromEntries(rows.map((row) => [row.marker, row.state]));
  }

  beforeAll(async () => {
    jest.useFakeTimers({
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
      now: new Date('2026-12-01T03:00:00Z'),
    });
    ctx = await createHttpTestApp();
    const install = await NestFactory.createApplicationContext(
      (await import('../../../src/modules/installation/installation.module')).InstallationModule,
      { logger: false },
    );
    try {
      await install
        .get(InstallationApi)
        .install({ ...INSTALLATION, environment: 'LOCAL_TEST', operatorReference: 'TEST-SEED' }, SEED_PASSWORD);
    } finally {
      await install.close();
    }
    baseUrl = `http://127.0.0.1:${((ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;
    const { SeedCliModule } = await import('../../../src/modules/installation/seed/seed-cli.module');
    demo = await NestFactory.createApplicationContext(SeedCliModule, { logger: false });
  }, 300000);

  afterAll(async () => {
    await demo?.close();
    await ctx?.close();
    jest.useRealTimers();
  });

  it('lets plan read December without changing business rows', async () => {
    at('2026-12-01T03:00:00Z');
    const before = await businessRows();
    expect(refusalOf(await run('plan'))).toBe('not refused');
    expect(await businessRows()).toEqual(before);
  }, 300000);

  it('applies in December with next-year budgets and every scenario reaches its state', async () => {
    at('2026-12-01T03:00:00Z');
    const outcome = await run('apply');

    expect(refusalOf(outcome)).toBe('not refused');
    const budgets = await ctx.sql.query<{ year: number; n: number }>(
      'SELECT year, count(*)::int AS n FROM budget_versions GROUP BY year ORDER BY year',
    );
    expect(budgets.rows).toEqual([
      { year: 2026, n: 3 },
      { year: 2027, n: 3 },
    ]);

    expect(await requestStates()).toEqual({
      R1: 'COMPLETED',
      R2: 'AWAITING_SPEND_DECISION',
      R3: 'PENDING',
      R4: 'REJECTED',
      R5: 'WITHDRAWN',
      R6: 'AWAITING_EXECUTION',
      R7: 'AWAITING_SPEND_SUBMISSION',
      R8: 'AWAITING_IT_ASSESSMENT',
      R9: 'AWAITING_FINANCE_REVIEW',
    });
  }, 600000);

  it('refuses plan and apply once the year has turned, writing nothing', async () => {
    at('2027-01-04T03:00:00Z');
    const before = await businessRows();

    for (const mode of ['plan', 'apply'] as const) {
      expect(refusalOf(await run(mode))).toMatch(/applied in 2026.*this is 2027/);
    }
    expect(await businessRows()).toEqual(before);
  }, 300000);
});

describe('seed forceNextFiscalYear on the real business day (integration)', () => {
  let ctx: HttpTestApp;
  let demo: INestApplicationContext;
  beforeAll(async () => {
    ctx = await createHttpTestApp();
    const install = await NestFactory.createApplicationContext(
      (await import('../../../src/modules/installation/installation.module')).InstallationModule,
      { logger: false },
    );
    try {
      await install
        .get(InstallationApi)
        .install({ ...INSTALLATION, environment: 'LOCAL_TEST', operatorReference: 'TEST-FORCE-YEAR' }, SEED_PASSWORD);
    } finally {
      await install.close();
    }
    demo = await NestFactory.createApplicationContext(
      (await import('../../../src/modules/installation/seed/seed-cli.module')).SeedCliModule,
      { logger: false },
    );
  }, 300000);
  afterAll(async () => {
    await demo?.close();
    await ctx?.close();
  });
  it('creates both budget years and reaches R1/R2 destinations on any real day', async () => {
    const accounts = demo.get(DemoAccountsApi);
    const facts = await accounts.inspect();
    const year = Number(facts?.today.slice(0, 4));
    const outcome = await runSeed({
      args: {
        mode: 'apply',
        fixture: 'shared-demo-v2',
        apiUrl: `http://127.0.0.1:${((ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`,
        operator: 'FORCED-NEXT',
        environment: 'LOCAL_TEST',
        json: false,
        allowBootstrap: false,
        secretsStdin: true,
      },
      secrets: { superAdminPassword: SEED_PASSWORD, demoAccountPassword: 'a long demo test password' },
      accounts,
      forceNextFiscalYear: true,
    });
    expect('report' in outcome && outcome.report.exitCode).toBe(0);
    expect(
      (
        await ctx.sql.query<{ year: number; n: number }>(
          'SELECT year, count(*)::int AS n FROM budget_versions GROUP BY year ORDER BY year',
        )
      ).rows,
    ).toEqual([
      { year, n: 3 },
      { year: year + 1, n: 3 },
    ]);
    const states = await ctx.sql.query<{ state: string }>(
      "SELECT state FROM access_requests WHERE business_reason LIKE '[DS1-R1]%' OR business_reason LIKE '[DS1-R2]%' ORDER BY business_reason",
    );
    expect(states.rows.map((row) => row.state)).toEqual(['COMPLETED', 'AWAITING_SPEND_DECISION']);
  }, 600000);
});
