import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo, Server } from 'node:net';
import request from 'supertest';
import type { DemoDatasetCommandArguments } from '../../../src/cli/demo-dataset/demo-dataset.arguments';
import { runDemoDataset, type DemoRunOutcome } from '../../../src/cli/demo-dataset/demo-dataset-run';
import type { FetchLike } from '../../../src/cli/demo-dataset/demo-api-client';
import { SHARED_DEMO_V1 } from '../../../src/cli/demo-dataset/fixture/shared-demo-v1';
import { DemoAccountsApi } from '../../../src/modules/installation/public/demo-accounts.api';
import { createHttpTestApp, HttpTestApp, SEED_PASSWORD, seedInstallation } from '../../support/http-test-app';

/**
 * `pnpm ops:demo-dataset` against a real installation: the whole application listens on a disposable PostgreSQL, the
 * command talks to it over HTTP as it does on the VPS, and writes its demo accounts through its own Nest graph on the same
 * database. Proves what a mock cannot: every record passes the real routes as the role they name, the requests reach their
 * states, a rerun writes nothing twice, a run stopped half-way goes on, and a plan writes no record of the dataset.
 */
describe('ops:demo-dataset (integration, real API and PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let demo: INestApplicationContext;
  let baseUrl: string;
  const demoAccounts = SHARED_DEMO_V1.people.filter((person) => person.account !== null).length;
  const secrets = { superAdminPassword: SEED_PASSWORD, demoAccountPassword: 'a demo password for the tests' };

  const args = (
    mode: 'plan' | 'apply',
    extra: Partial<DemoDatasetCommandArguments> = {},
  ): DemoDatasetCommandArguments => ({
    mode,
    fixture: 'shared-demo-v1',
    organization: 'Acme',
    apiUrl: baseUrl,
    operator: 'TEST-DEMO-1',
    environment: 'LOCAL_TEST',
    json: false,
    ...extra,
  });
  const run = (
    mode: 'plan' | 'apply',
    options: { args?: Partial<DemoDatasetCommandArguments>; fetch?: FetchLike } = {},
  ) =>
    runDemoDataset({
      args: args(mode, options.args),
      secrets,
      accounts: demo.get(DemoAccountsApi),
      fetch: options.fetch,
    });
  const refusalOf = (outcome: DemoRunOutcome): string => ('refused' in outcome ? outcome.refused : 'not refused');
  const reportOf = (outcome: DemoRunOutcome) => {
    if ('refused' in outcome) throw new Error(`refused: ${outcome.refused}`);
    return outcome.report;
  };

  /** Rows of every table but the ones a sign-in writes (sessions, tokens, throttles and their audit events). */
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

  /** Sessions holding the apply lock of the fixture: an apply that ended, however it ended, leaves none. */
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

  async function requestStates(): Promise<Record<string, string>> {
    const { rows } = await ctx.sql.query<{ marker: string; state: string }>(
      `SELECT substring(coalesce(p.purpose, r.business_reason) from '^\\[DS1-(R[0-9]+)\\]') AS marker, r.state::text AS state
         FROM access_requests r LEFT JOIN access_request_proposals p ON p.request_id = r.id
        WHERE coalesce(p.purpose, r.business_reason) LIKE '[DS1-R%'`,
    );
    return Object.fromEntries(rows.map((row) => [row.marker, row.state]));
  }

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    await seedInstallation(ctx.app);
    baseUrl = `http://127.0.0.1:${((ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;
    const { DemoDatasetCliModule } =
      await import('../../../src/modules/installation/demo-dataset/demo-dataset-cli.module');
    demo = await NestFactory.createApplicationContext(DemoDatasetCliModule, { logger: false });
  }, 300000);

  afterAll(async () => {
    await demo?.close();
    await ctx?.close();
  });

  it('refuses another organization, a wrong Super Admin password, an unknown fixture or an unreachable API, writing nothing', async () => {
    const before = await businessRows();
    expect(refusalOf(await run('apply', { args: { organization: 'Other Co' } }))).toContain('wrong database');
    const wrongPassword = await runDemoDataset({
      args: args('apply'),
      secrets: { ...secrets, superAdminPassword: 'not the super admin password' },
      accounts: demo.get(DemoAccountsApi),
    });
    expect(refusalOf(wrongPassword)).toContain('refused the Super Admin password');
    expect(refusalOf(await run('apply', { args: { fixture: 'shared-demo-v9' } }))).toContain('Unknown fixture');
    expect(refusalOf(await run('apply', { args: { apiUrl: 'http://127.0.0.1:9' } }))).toContain('cannot be reached');
    expect(await businessRows()).toEqual(before);
  }, 120000);

  it('plans on the bare installation without writing any record of the dataset', async () => {
    const before = await businessRows();
    const report = reportOf(await run('plan'));

    expect(report.exitCode).toBe(0);
    expect(report.steps.find((step) => step.key === 'org.departments')).toMatchObject({ status: 'planned' });
    expect(report.steps.find((step) => step.key === 'requests.R1')).toMatchObject({ status: 'waiting' });
    expect(await businessRows()).toEqual(before);
  }, 120000);

  it('refuses a second apply while another holds the lock of the fixture, writing nothing and leaving no lock', async () => {
    const before = await businessRows();
    const other = await demo.get(DemoAccountsApi).holdApplyLock('shared-demo-v1');
    expect(other).not.toBeNull();
    try {
      expect(await heldAdvisoryLocks()).toBe(1);
      expect(refusalOf(await run('apply'))).toContain('Another apply of this fixture is running');
    } finally {
      await other?.release();
    }

    expect(await businessRows()).toEqual(before);
    expect(await heldAdvisoryLocks()).toBe(0);
  }, 120000);

  it('stops when the API becomes unreachable half-way, then a second apply goes on to every scenario state', async () => {
    let writes = 0;
    const flaky: FetchLike = (url, init) => {
      const write = init.method !== 'GET' && !url.includes('/auth/');
      if (write && ++writes > 20) return Promise.reject(new TypeError('fetch failed'));
      return fetch(url, init);
    };
    const stopped = reportOf(await run('apply', { fetch: flaky }));
    expect(stopped.exitCode).toBe(1);
    expect(stopped.steps.at(-1)).toMatchObject({ status: 'failed' });
    expect(await heldAdvisoryLocks()).toBe(0);

    const resumed = reportOf(await run('apply'));
    expect(resumed.steps.filter((step) => step.status !== 'done' && step.status !== 'present')).toEqual([]);
    expect(resumed.exitCode).toBe(0);
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

  it('writes nothing on a rerun (nothing to change), and keeps its accounts hashed and attributed to the operator', async () => {
    const before = await businessRows();
    const again = reportOf(await run('apply'));

    expect(again.exitCode).toBe(2);
    expect(await businessRows()).toEqual(before);
    const accounts = await ctx.sql.query<{ hash: string }>(
      `SELECT c.hash FROM password_credentials c JOIN app_users u ON u.id = c.app_user_id
        WHERE u.normalized_login_email LIKE '%@ds1.slm-demo.example'`,
    );
    expect(accounts.rows).toHaveLength(demoAccounts);
    expect(
      accounts.rows.every((row) => row.hash.startsWith('$argon2') && !row.hash.includes(secrets.demoAccountPassword)),
    ).toBe(true);
    const audit = await ctx.sql.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_events WHERE action = 'DEMO_DATASET.ACCOUNT_CREATED' AND operator_reference = $1`,
      ['DEMO_DATASET:shared-demo-v1:TEST-DEMO-1'],
    );
    expect(Number(audit.rows[0].n)).toBe(demoAccounts);
    const doubled = await ctx.sql.query(
      `SELECT business_reason FROM access_requests WHERE business_reason LIKE '[DS1-%' GROUP BY business_reason HAVING count(*) > 1`,
    );
    expect(doubled.rows).toEqual([]);
  }, 300000);

  it('reports a record of the dataset changed since as a conflict, and leaves it as it was', async () => {
    // Finance changes the tax profile of the demo vendor: the dataset's record no longer matches the fixture.
    const finance = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'phuc.trinh@ds1.slm-demo.example', password: secrets.demoAccountPassword });
    const financeToken = (finance.body as { data: { accessToken: string } }).data.accessToken;
    const vendor = await ctx.sql.query<{ id: string }>(`SELECT id FROM vendors WHERE name = 'Figma (demo)'`);
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/vendors/${vendor.rows[0].id}/tax-profile`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ group: 'T1', lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }] })
      .expect(200);
    const before = await businessRows();

    const report = reportOf(await run('apply'));

    expect(report.exitCode).toBe(4);
    expect(report.steps.find((step) => step.key === 'finance.tax-profile')).toMatchObject({ status: 'conflict' });
    expect(report.steps.filter((step) => step.status === 'conflict').map((step) => step.key)).toEqual([
      'finance.tax-profile',
    ]);
    expect(await businessRows()).toEqual(before);
  }, 300000);

  it('reports a conflict instead of overwriting data that no longer matches the dataset, and blocks what needs it', async () => {
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@acme.vn', password: SEED_PASSWORD });
    const token = (login.body as { data: { accessToken: string } }).data.accessToken;
    const { rows } = await ctx.sql.query<{ id: string }>(`SELECT id FROM departments WHERE code = 'DS1-OPS'`);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/departments/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Vận hành (đổi tay)',
        hrBasis: { type: 'Quyết định', reference: 'QD-TEST', issuer: 'Ban Giám đốc', issuedOn: '2026-01-02' },
      })
      .expect(200);

    const report = reportOf(await run('apply'));
    expect(report.exitCode).toBe(4);
    const departments = report.steps.find((step) => step.key === 'org.departments');
    expect(departments?.status).toBe('conflict');
    expect(departments?.detail).toContain('DS1-OPS');
    expect(report.steps.find((step) => step.key === 'org.employees')).toMatchObject({ status: 'blocked' });
    const kept = await ctx.sql.query<{ name: string }>(`SELECT name FROM departments WHERE code = 'DS1-OPS'`);
    expect(kept.rows[0].name).toBe('Vận hành (đổi tay)');
  }, 300000);
});
