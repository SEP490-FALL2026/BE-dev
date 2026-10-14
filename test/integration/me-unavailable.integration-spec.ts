import request from 'supertest';
import { bodyOf } from '../support/api-body';
import { HttpTestApp, SEED_PASSWORD, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { PgRelay } from '../support/pg-relay';

/**
 * R-15: GET /me when the database stops answering AFTER the guard has verified the token. The guard's
 * own reads succeed; only MeService's query (the login email) is held, so the answer comes from the
 * controller's mapping, not from the guard's TOKEN_VERIFICATION_UNAVAILABLE.
 */
describe('GET /me when the database stops answering after the guard (integration)', () => {
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
        DB_QUERY_TIMEOUT_MS: '2000',
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

  it('answers 503 SERVICE_UNAVAILABLE within the query timeout, not 500', async () => {
    relay.holdWhen(/"login_email"/);
    const started = Date.now();
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/me')
      .set({ Authorization: `Bearer ${token}` });
    relay.releaseHeld();

    expect(response.status).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(Date.now() - started).toBeLessThan(2000 + 1500);
  }, 20000);

  it('answers 200 again once the database answers', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/v1/me')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
  });
});
