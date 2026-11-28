import { INSTALLATION } from '../../../src/cli/seed/fixture/shared-demo-v4/installation';
import { InstallationApi } from '../../../src/modules/installation/public/installation.api';
import { EmployeeRepo } from '../../../src/modules/organization/employee/employee.repo';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo, Server } from 'node:net';
import type { SeedCommandArguments } from '../../../src/cli/seed/seed.arguments';
import { runSeed, type DemoRunOutcome } from '../../../src/cli/seed/seed-run';
import { SHARED_DEMO_V4 } from '../../../src/cli/seed/fixture/shared-demo-v4';
import { DemoAccountsApi } from '../../../src/modules/installation/public/demo-accounts.api';
import { SeedStorage } from '../../support/flows/seed-storage';
import { createHttpTestApp, HttpTestApp, SEED_PASSWORD } from '../../support/http-test-app';
import { SHARED_DEMO_V4_REQUEST_STATES } from '../../support/seed-demo-v4-states';

/**
 * `pnpm ops:seed` at the edges of the year, on a controlled clock: only `Date` is faked (the API and the command
 * share this process, so both read the same business day); timers stay real so the database driver and the HTTP stack
 * work as usual. The database keeps its own clock, which no rule of the scenarios reads.
 */
describe('ops:seed at the edges of the year (integration, real API and PostgreSQL, controlled date)', () => {
  // The bytes the seed puts at upload links land in the storage the application reads (BM-10, files of a version).
  const seedStorage = new SeedStorage();
  let ctx: HttpTestApp;
  let demo: INestApplicationContext;
  let baseUrl: string;
  const secrets = { superAdminPassword: SEED_PASSWORD, demoAccountPassword: 'a demo password for the tests' };
  const at = (instant: string) => jest.setSystemTime(new Date(instant));

  const run = (mode: 'plan' | 'apply') =>
    runSeed({
      args: {
        mode,
        fixture: 'shared-demo-v4',
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
      `SELECT substring(coalesce(p.purpose, r.business_reason) from '^\\[SV-(R[0-9]+)\\]') AS marker, r.state::text AS state
         FROM access_requests r LEFT JOIN access_request_proposals p ON p.request_id = r.id
        WHERE coalesce(p.purpose, r.business_reason) LIKE '[SV-R%'`,
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
    await seedStorage.start();
    ctx = await createHttpTestApp({ providerOverrides: [seedStorage.override] });
    jest
      .spyOn(ctx.app.get(EmployeeRepo, { strict: false }), 'databaseNow')
      .mockImplementation(() => Promise.resolve(new Date()));
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
    await seedStorage.stop();
    jest.restoreAllMocks();
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
    // Shared demo v4: every department with a Cost Center and a head holds an approved version of 2026 (Legal has no head, D-Z2-2); of
    // 2027 Engineering's is approved, Marketing's waits for the spending approver and Sales' was returned (IT stays at its BM-10).
    expect(budgets.rows).toEqual([
      { year: 2026, n: SHARED_DEMO_V4.budgets.length },
      { year: 2027, n: SHARED_DEMO_V4.nextYear.filter((n) => n.stage !== 'PROPOSAL_SUBMITTED').length },
    ]);
    // The seed opened the three cycles and locked for good the two that hold versions (the deadline moved to the day before the seed); the year after is still taking proposals.
    const cycles = await ctx.sql.query<{ year: number; opened: boolean; deadline: string }>(
      `SELECT year, opened_at IS NOT NULL AS opened, to_char(submission_deadline, 'YYYY-MM-DD') AS deadline
         FROM budget_cycles ORDER BY year`,
    );
    expect(cycles.rows).toEqual([
      { year: 2026, opened: true, deadline: '2026-11-30' },
      { year: 2027, opened: true, deadline: '2026-11-30' },
      { year: 2028, opened: true, deadline: '2027-12-01' },
    ]);

    // R57 is cancelled by the sweep of the block moment, which may run while the suite does (its first pass is five minutes after start).
    const states = await requestStates();
    expect(['PENDING', 'CANCELLED']).toContain(states.R57);
    expect({ ...states, R57: 'PENDING' }).toEqual({
      ...SHARED_DEMO_V4_REQUEST_STATES,
      R40: 'AWAITING_SPEND_DECISION',
      R41: 'REJECTED',
      R42: 'AWAITING_REQUESTER_REVISION',
      R43: 'IT_REJECTED',
      R44: 'AWAITING_REQUESTER_REVISION',
      R45: 'AWAITING_REQUESTER_REVISION',
      R46: 'EXECUTING',
      R47: 'FAILED',
      R48: 'FAILED',
      R49: 'AWAITING_EXECUTION',
      R50: 'COMPLETED',
      R51: 'PENDING',
      R52: 'PENDING',
      R53: 'PENDING',
      R54: 'AWAITING_SPEND_DECISION',
      R55: 'AWAITING_SPEND_DECISION',
      R56: 'COMPLETED',
      R57: 'PENDING',
      R58: 'AWAITING_SPEND_DECISION',
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
