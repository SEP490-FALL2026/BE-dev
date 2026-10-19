import request from 'supertest';
import { bodyOf } from '../support/api-body';
import { Client } from 'pg';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../support/http-test-app';

/** A well-formed token no session owns: what a client with a stale token would send. */
const UNKNOWN_REFRESH_TOKEN = 'A'.repeat(43);

function refreshToken(response: request.Response): string {
  return bodyOf(response).data.refreshToken;
}

/** Resolves once some backend is waiting for a lock — never guesses with a fixed delay. */
async function waitForLockWait(observer: Client, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await observer.query<{ waiting: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted) AS waiting',
    );
    if (rows[0].waiting) return;
    if (Date.now() > deadline) throw new Error('No backend reached a lock wait in time.');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('lock protocol: authentication races (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let holder: Client;
  const server = () => ctx.app.getHttpServer();
  const login = (email: string, password = SEED_PASSWORD) =>
    request(server()).post('/api/v1/auth/login').send({ email, password });
  const refresh = (token: string) => request(server()).post('/api/v1/auth/refresh').send({ refreshToken: token });
  const logout = (token: string) => request(server()).post('/api/v1/auth/logout').send({ refreshToken: token });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    holder = new Client({ connectionString: ctx.database.url });
    await holder.connect();
  }, 90000);

  afterAll(async () => {
    await holder?.end();
    await ctx?.close();
  });

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
    await ctx.sql.query('DELETE FROM login_throttles');
  });

  /** The lock operation of a later slice, in its protocol order: AppUser row first, then its sessions. */
  async function lockAccountHolding(appUserId: string): Promise<{ commit: () => Promise<void> }> {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [appUserId]);
    await holder.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [appUserId]);
    return {
      commit: async () => {
        await holder.query(
          `UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'ACCOUNT_LOCKED'
           WHERE app_user_id = $1 AND revoked_at IS NULL`,
          [appUserId],
        );
        await holder.query('COMMIT');
      },
    };
  }

  const unlock = (appUserId: string) =>
    ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [appUserId]);

  it('login that races a lock which commits first is refused and creates no session', async () => {
    const email = 'race-login@acme.vn';
    const { appUserId } = await insertAccountFixture(ctx.app, seed, { code: 'E-RL', email, activated: true });
    const lock = await lockAccountHolding(appUserId);

    const pending = login(email).then((response) => response);
    await waitForLockWait(ctx.sql);
    await lock.commit();
    const response = await pending;

    expect(response.status).toBe(401);
    expect(bodyOf(response).error.code).toBe('AUTH.INVALID_CREDENTIALS');
    const sessions = await ctx.sql.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM auth_sessions WHERE app_user_id = $1',
      [appUserId],
    );
    expect(sessions.rows[0].n).toBe(0);
    await unlock(appUserId);
  });

  it('refresh that races a lock which commits first is refused and issues no new token', async () => {
    const email = 'race-refresh@acme.vn';
    const { appUserId } = await insertAccountFixture(ctx.app, seed, { code: 'E-RR', email, activated: true });
    const session = await login(email).expect(200);
    const tokens = await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM refresh_tokens');
    const before = tokens.rows[0].n;
    const lock = await lockAccountHolding(appUserId);

    const pending = refresh(refreshToken(session)).then((response) => response);
    await waitForLockWait(ctx.sql);
    await lock.commit();
    const response = await pending;

    expect(response.status).toBe(401);
    expect(bodyOf(response).error.code).toBe('AUTH.SESSION_INVALID');
    expect((await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM refresh_tokens')).rows[0].n).toBe(
      before,
    );
    await unlock(appUserId);
  });

  it('refresh that commits before a lock leaves a token that is useless once the lock revokes the session', async () => {
    const email = 'race-first@acme.vn';
    const { appUserId } = await insertAccountFixture(ctx.app, seed, { code: 'E-RF', email, activated: true });
    const session = await login(email).expect(200);

    const refreshed = await refresh(refreshToken(session)).expect(200);
    const lock = await lockAccountHolding(appUserId);
    await lock.commit();

    await request(server())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${bodyOf(refreshed).data.accessToken}`)
      .expect(401);
    await refresh(refreshToken(refreshed)).expect(401);
    await unlock(appUserId);
  });

  it('two simultaneous refreshes with one token: exactly one succeeds and the session is revoked', async () => {
    const email = 'race-twice@acme.vn';
    const { appUserId } = await insertAccountFixture(ctx.app, seed, { code: 'E-R2', email, activated: true });
    const session = await login(email).expect(200);
    const token = refreshToken(session);

    const [a, b] = await Promise.all([refresh(token), refresh(token)]);

    expect([a.status, b.status].sort()).toEqual([200, 401]);
    const winner = a.status === 200 ? a : b;
    const loser = winner === a ? b : a;
    // Only the winner carries credentials and their expiries; the replayed request gets the plain error.
    expect(new Date(bodyOf(winner).data.refreshExpiresAt).toISOString()).toBe(bodyOf(winner).data.refreshExpiresAt);
    expect(bodyOf(loser).data).toBeUndefined();
    expect(bodyOf(loser).error.code).toBe('AUTH.SESSION_INVALID');
    // The loser presented an already-consumed token, which is treated as replay: the whole session ends.
    await request(server())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${bodyOf(winner).data.accessToken}`)
      .expect(401);
    // Exactly one event, for this account's one session: a revoke from another test cannot satisfy it (CP0-05).
    const sessions = await ctx.sql.query<{ id: string }>('SELECT id FROM auth_sessions WHERE app_user_id = $1', [
      appUserId,
    ]);
    expect(sessions.rows).toHaveLength(1);
    const audit = await ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'SESSION.REVOKED' AND resource_id = $1`,
      [sessions.rows[0].id],
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it('a mixed storm of login, refresh, logout and locking never deadlocks (no 503 / 40P01)', async () => {
    const email = 'race-storm@acme.vn';
    const { appUserId } = await insertAccountFixture(ctx.app, seed, { code: 'E-RS', email, activated: true });
    const statuses: number[] = [];

    for (let round = 0; round < 12; round += 1) {
      const session = await login(email);
      const token = session.status === 200 ? refreshToken(session) : UNKNOWN_REFRESH_TOKEN;
      const work: Array<Promise<unknown>> = [
        login(email).then((r) => statuses.push(r.status)),
        refresh(token).then((r) => statuses.push(r.status)),
        logout(token).then((r) => statuses.push(r.status)),
        (async () => {
          const lock = await lockAccountHolding(appUserId);
          await new Promise((resolve) => setTimeout(resolve, round % 3));
          await lock.commit();
          await unlock(appUserId);
        })(),
      ];
      // Shuffle start order by awaiting in a rotated sequence; all four are already in flight.
      await Promise.all(work.slice(round % work.length).concat(work.slice(0, round % work.length)));
      await ctx.sql.query('DELETE FROM login_throttles');
    }

    expect(statuses.filter((status) => status === 503 || status >= 500)).toEqual([]);
  }, 120000);
});
