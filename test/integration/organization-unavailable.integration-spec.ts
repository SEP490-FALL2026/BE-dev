import request from 'supertest';
import { bodyOf } from '../support/api-body';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { PgRelay } from '../support/pg-relay';

const QUERY_TIMEOUT_MS = 2000;
const SLACK_MS = 1500;

/**
 * The database stops answering in the middle of the transaction that writes a job title or an employee: the
 * caller gets a retryable 503 and nothing is half-written (no person without a placement, no change without audit).
 */
describe('job titles and manual entry when the database stops answering mid-transaction (integration)', () => {
  let ctx: HttpTestApp;
  let relay: PgRelay;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  const server = () => ctx.app.getHttpServer();
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);
        return url.toString();
      },
      env: {
        DB_QUERY_TIMEOUT_MS: String(QUERY_TIMEOUT_MS),
        DB_STATEMENT_TIMEOUT_MS: '1500',
        DB_LOCK_TIMEOUT_MS: '500',
        DB_CONNECT_TIMEOUT_MS: '1000',
      },
    });
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
  }, 120000);

  afterAll(async () => {
    relay?.releaseHeld();
    await ctx?.close();
    await relay?.stop();
  });

  afterEach(() => relay.releaseHeld());

  const footprint = async () =>
    (
      await ctx.sql.query(
        `SELECT (SELECT count(*)::int FROM employees) AS employees, (SELECT count(*)::int FROM employee_placements) AS placements,
                (SELECT count(*)::int FROM job_titles) AS job_titles, (SELECT count(*)::int FROM audit_events) AS audit_events`,
      )
    ).rows[0] as Record<string, number>;

  const noBackendLeftIdleInTransaction = async (): Promise<void> => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const { rows } = await ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'`,
      );
      if (rows[0].n === 0) return;
      if (Date.now() > deadline) throw new Error('A backend is still idle in transaction after the stall ended.');
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };

  it('answers an employee entry 503 within the query timeout, with no person, no placement and no audit', async () => {
    const before = await footprint();

    relay.holdWhen(/INSERT INTO "public"\."employee_placements"/);
    const started = Date.now();
    const stalled = await request(server()).post('/api/v1/employees').set(asIt()).send({
      employeeCode: 'E-STALL',
      fullName: 'Stalled Person',
      workEmail: 'stalled@acme.vn',
      employmentType: 'STAFF',
      hireDate: '2026-10-01',
      departmentCode: 'P-OPS',
      jobTitleId: seed.jobTitleId,
    });
    const elapsed = Date.now() - started;
    expect(relay.holding).toBe(true);
    relay.releaseHeld();

    expect(stalled.status).toBe(503);
    expect(bodyOf(stalled).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(elapsed).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS + 4000);
    await noBackendLeftIdleInTransaction();
    expect(await footprint()).toEqual(before);
  }, 60000);

  it('answers a job title addition 503 and writes neither the title nor its audit event', async () => {
    const before = await footprint();

    relay.holdWhen(/INSERT INTO "public"\."job_titles"/);
    const stalled = await request(server()).post('/api/v1/job-titles').set(asIt()).send({ name: 'Stalled Title' });
    expect(relay.holding).toBe(true);
    relay.releaseHeld();

    expect(stalled.status).toBe(503);
    expect(bodyOf(stalled).error.code).toBe('SERVICE_UNAVAILABLE');
    await noBackendLeftIdleInTransaction();
    expect(await footprint()).toEqual(before);
  }, 60000);

  it('answers a deactivation 503 and leaves the title as it was', async () => {
    const title = (
      (await request(server()).post('/api/v1/job-titles').set(asIt()).send({ name: 'Keeps Status' }).expect(201))
        .body as { data: { id: string } }
    ).data.id;
    const before = await footprint();

    relay.holdWhen(/UPDATE "public"\."job_titles"/);
    const stalled = await request(server()).post(`/api/v1/job-titles/${title}/deactivate`).set(asIt());
    expect(relay.holding).toBe(true);
    relay.releaseHeld();

    expect(stalled.status).toBe(503);
    await noBackendLeftIdleInTransaction();
    expect(await footprint()).toEqual(before);
    expect((await ctx.sql.query('SELECT status, version FROM job_titles WHERE id = $1', [title])).rows).toEqual([
      { status: 'ACTIVE', version: 1 },
    ]);
  }, 60000);

  it('works again once the database answers', async () => {
    await request(server()).post('/api/v1/job-titles').set(asIt()).send({ name: 'After The Stall' }).expect(201);
  });
});
