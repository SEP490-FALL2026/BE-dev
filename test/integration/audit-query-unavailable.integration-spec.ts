import request from 'supertest';
import { bodyOf } from '../support/api-body';
import { HttpTestApp, SEED_PASSWORD, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { PgRelay } from '../support/pg-relay';

const QUERY_TIMEOUT_MS = 2000;
const SLACK_MS = 1500;

/**
 * `GET /audit-events` when the database stops answering AFTER the guard has verified the token. The guard's
 * own reads touch other tables; only the trail's query is held, so the answer comes from the controller's
 * mapping, not from the guard's TOKEN_VERIFICATION_UNAVAILABLE.
 */
describe('GET /audit-events when the database stops answering after the guard (integration)', () => {
  let ctx: HttpTestApp;
  let relay: PgRelay;
  let token: string;

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
    const seed = await seedInstallation(ctx.app);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      .expect(200);
    token = bodyOf(login).data.accessToken;
  }, 90000);

  afterAll(async () => {
    relay?.releaseHeld();
    await ctx?.close();
    await relay?.stop();
  });

  afterEach(() => relay.releaseHeld());

  it('answers 503 SERVICE_UNAVAILABLE within the query timeout, not 500 and not a hang', async () => {
    relay.holdWhen(/audit_events/);
    const started = Date.now();
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/audit-events')
      .set({ Authorization: `Bearer ${token}` });
    const elapsed = Date.now() - started;
    expect(relay.holding).toBe(true);
    relay.releaseHeld();

    expect(response.status).toBe(503);
    expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(elapsed).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS + 4000);
  }, 30000);

  it('leaves no backend idle in a transaction, and answers again once the database answers', async () => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const { rows } = await ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'`,
      );
      if (rows[0].n === 0) break;
      if (Date.now() > deadline) throw new Error('A backend is still idle in transaction after the stall ended.');
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    await request(ctx.app.getHttpServer())
      .get('/api/v1/audit-events')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
  }, 30000);
});
