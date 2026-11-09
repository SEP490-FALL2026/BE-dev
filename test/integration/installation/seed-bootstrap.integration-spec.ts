import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo, Server } from 'node:net';
import { INSTALLATION } from '../../../src/cli/seed/fixture/shared-demo-v3/installation';
import { runSeed } from '../../../src/cli/seed/seed-run';
import type { SeedCommandArguments } from '../../../src/cli/seed/seed.arguments';
import { InstallationApi } from '../../../src/modules/installation/public/installation.api';
import { DemoAccountsApi } from '../../../src/modules/installation/public/demo-accounts.api';
import { createHttpTestApp, type HttpTestApp, SEED_PASSWORD } from '../../support/http-test-app';

describe('seed bootstrap from an empty database (integration, real API and PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let demo: INestApplicationContext;
  let baseUrl: string;
  const secrets = { superAdminPassword: SEED_PASSWORD, demoAccountPassword: 'a long demo test password' };
  const args = (allowBootstrap: boolean): SeedCommandArguments => ({
    mode: 'apply',
    fixture: 'shared-demo-v3',
    apiUrl: baseUrl,
    operator: 'TEST-SEED-BOOTSTRAP',
    environment: 'LOCAL_TEST',
    json: false,
    secretsStdin: true,
    allowBootstrap,
  });
  const bootstrap = async () => {
    const install = await NestFactory.createApplicationContext(
      (await import('../../../src/modules/installation/installation.module')).InstallationModule,
      { logger: false },
    );
    try {
      await install
        .get(InstallationApi)
        .install(
          { ...INSTALLATION, environment: 'LOCAL_TEST', operatorReference: 'SEED:shared-demo-v3:TEST' },
          secrets.superAdminPassword,
        );
    } finally {
      await install.close();
    }
  };
  const run = (allowBootstrap: boolean, password = secrets.superAdminPassword) =>
    runSeed({
      args: args(allowBootstrap),
      secrets: { ...secrets, superAdminPassword: password },
      accounts: demo.get(DemoAccountsApi),
      bootstrap,
    });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    baseUrl = `http://127.0.0.1:${((ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;
    demo = await NestFactory.createApplicationContext(
      (await import('../../../src/modules/installation/seed/seed-cli.module')).SeedCliModule,
      { logger: false },
    );
  }, 300000);
  afterAll(async () => {
    await demo?.close();
    await ctx?.close();
  });

  it('refuses weak passwords and missing bootstrap authorization without creating anything', async () => {
    expect(await run(true, 'short')).toEqual({ refused: 'SECRETS TOO_SHORT' });
    expect(await run(false)).toEqual({ refused: 'EMPTY: use --allow-bootstrap or ops:bootstrap.' });
    expect((await ctx.sql.query('SELECT * FROM organizations')).rowCount).toBe(0);
  });

  it('bootstraps and reaches all scenario targets, then reruns without changes', async () => {
    const outcomes = await Promise.all([run(true), run(true)]);
    expect(outcomes.filter((outcome) => 'report' in outcome && outcome.report.exitCode === 0)).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => 'refused' in outcome && outcome.refused.includes('Another apply')),
    ).toHaveLength(1);
    expect((await ctx.sql.query("SELECT code FROM departments WHERE code = 'ADMIN'")).rowCount).toBe(1);
    expect(
      (await ctx.sql.query("SELECT role FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL")).rowCount,
    ).toBe(1);
    expect(
      (
        await ctx.sql.query(
          'SELECT u.id FROM app_users u LEFT JOIN role_grants g ON g.app_user_id = u.id AND g.revoked_at IS NULL GROUP BY u.id HAVING count(g.id) <> 1',
        )
      ).rowCount,
    ).toBe(0);
    const again = await run(true);
    expect('report' in again && again.report.exitCode).toBe(2);
  }, 600000);
});
