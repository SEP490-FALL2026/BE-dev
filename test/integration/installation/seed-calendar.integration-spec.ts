import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo, Server } from 'node:net';
import type { SeedCommandArguments } from '../../../src/cli/seed/seed.arguments';
import { runSeed, type DemoRunOutcome } from '../../../src/cli/seed/seed-run';
import { DemoAccountsApi } from '../../../src/modules/installation/public/demo-accounts.api';
import { createHttpTestApp, HttpTestApp, SEED_PASSWORD, seedInstallation } from '../../support/http-test-app';

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
        organization: 'Acme',
        apiUrl: baseUrl,
        operator: 'TEST-CALENDAR',
        environment: 'LOCAL_TEST',
        json: false,
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
    await seedInstallation(ctx.app);
    baseUrl = `http://127.0.0.1:${((ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;
    const { SeedCliModule } = await import('../../../src/modules/installation/seed/seed-cli.module');
    demo = await NestFactory.createApplicationContext(SeedCliModule, { logger: false });
  }, 300000);

  afterAll(async () => {
    await demo?.close();
    await ctx?.close();
    jest.useRealTimers();
  });

  it('refuses apply on the 1st of December, writing nothing, and lets plan read', async () => {
    at('2026-12-01T03:00:00Z');
    const before = await businessRows();

    expect(refusalOf(await run('apply'))).toMatch(/30th of November only/);
    expect(refusalOf(await run('plan'))).toBe('not refused');
    expect(await businessRows()).toEqual(before);
  }, 300000);

  it('applies on the 30th of November, the last day it writes, and every scenario reaches its state', async () => {
    at('2026-11-30T03:00:00Z');
    const outcome = await run('apply');

    expect(refusalOf(outcome)).toBe('not refused');
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
