import request from 'supertest';
import { bodyOf } from '../support/api-body';
import { adminToken } from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { PgRelay } from '../support/pg-relay';
import { HR_BASIS } from '../support/hr-basis';

const QUERY_TIMEOUT_MS = 2000;
const SLACK_MS = 1500;

/**
 * The database stops answering in the middle of the transaction that writes an employee: the caller gets a retryable
 * 503 and nothing is half-written (no person without a placement, no change without audit).
 */
describe('manual entry when the database stops answering mid-transaction (integration)', () => {
  let ctx: HttpTestApp;
  let relay: PgRelay;
  let seed: SeededInstallation;
  const server = () => ctx.app.getHttpServer();
  let superAdmin: string;

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
    superAdmin = admin;
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
    const stalled = await request(server())
      .post('/api/v1/employees')
      .set({ Authorization: `Bearer ${superAdmin}` })
      .send({
        hrBasis: HR_BASIS,
        employeeCode: 'E-STALL',
        fullName: 'Stalled Person',
        workEmail: 'stalled@acme.vn',
        employmentType: 'STAFF',
        hireDate: '2026-10-01',
        departmentCode: 'P-OPS',
        jobTitle: 'Administrator',
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

  it('works again once the database answers', async () => {
    await request(server())
      .post('/api/v1/employees')
      .set({ Authorization: `Bearer ${superAdmin}` })
      .send({
        hrBasis: HR_BASIS,
        employeeCode: 'E-AFTER',
        fullName: 'After The Stall',
        workEmail: 'after@acme.vn',
        employmentType: 'STAFF',
        hireDate: '2026-10-01',
        departmentCode: 'P-OPS',
        jobTitle: 'Administrator',
      })
      .expect(201);
  });
});
