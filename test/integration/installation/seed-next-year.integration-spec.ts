import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo, Server } from 'node:net';
import { INSTALLATION } from '../../../src/cli/seed/fixture/shared-demo-v2/installation';
import { runSeed } from '../../../src/cli/seed/seed-run';
import { DemoAccountsApi } from '../../../src/modules/installation/public/demo-accounts.api';
import { InstallationApi } from '../../../src/modules/installation/public/installation.api';
import { createHttpTestApp, HttpTestApp, SEED_PASSWORD } from '../../support/http-test-app';

/**
 * The next-fiscal-year branch of `pnpm ops:seed` (Owner 04/11/2026: a seed late in the year builds next year's budgets), forced on
 * the real business day so it is proven whatever the date of the run. A file of its own: one test application per file.
 */
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
          "SELECT year, count(*)::int AS n FROM budget_versions WHERE state = 'APPROVED' GROUP BY year ORDER BY year",
        )
      ).rows,
    ).toEqual([
      { year, n: 3 },
      { year: year + 1, n: 3 },
    ]);
    // Every budget of both years is the approved, current one of its Cost Center and year (INV-21).
    expect(
      (await ctx.sql.query<{ n: number }>("SELECT count(*)::int AS n FROM budget_versions WHERE state <> 'APPROVED'"))
        .rows[0].n,
    ).toBe(0);
    const states = await ctx.sql.query<{ state: string }>(
      "SELECT state FROM access_requests WHERE business_reason LIKE '[DS1-R1]%' OR business_reason LIKE '[DS1-R2]%' ORDER BY business_reason",
    );
    expect(states.rows.map((row) => row.state)).toEqual(['COMPLETED', 'AWAITING_SPEND_DECISION']);
  }, 600000);
});
