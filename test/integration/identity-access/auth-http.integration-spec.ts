import { createHash } from 'node:crypto';
import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../../support/http-test-app';
import { findPlacementCoverageViolations } from '../../support/placement-coverage';

/** A well-formed refresh token: 32 random bytes, base64url. */
const REFRESH_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

function setCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown;
  if (Array.isArray(header)) return header as string[];
  return typeof header === 'string' ? [header] : [];
}

/** The refresh token a login or refresh response carries in its body. */
function refreshTokenOf(response: request.Response): string {
  return bodyOf(response).data.refreshToken;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('authentication over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  const server = () => ctx.app.getHttpServer();

  const login = (email: string, password: string) =>
    request(server()).post('/api/v1/auth/login').send({ email, password });
  const loginAdmin = () => login(seed.superAdmin.email, SEED_PASSWORD).expect(200);
  const refresh = (refreshToken: string) => request(server()).post('/api/v1/auth/refresh').send({ refreshToken });
  const logout = (refreshToken: string) => request(server()).post('/api/v1/auth/logout').send({ refreshToken });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  afterEach(async () => {
    await ctx.sql.query('DELETE FROM login_throttles');
  });

  /** The stored row of a refresh token, found by the hash of the raw token a response returned. */
  const storedToken = async (rawToken: string) =>
    (
      await ctx.sql.query<{ expires_at: Date; session_id: string }>(
        'SELECT expires_at, session_id FROM refresh_tokens WHERE token_hash = $1',
        [sha256(rawToken)],
      )
    ).rows[0];

  describe('login and /me', () => {
    it('signs the Super Admin in with an access token and a refresh token in the body, and serves /me', async () => {
      const response = await loginAdmin();

      expect(bodyOf(response)).toMatchObject({
        success: true,
        message: 'AUTH.LOGGED_IN',
        data: { tokenType: 'Bearer' },
      });
      expect(typeof bodyOf(response).data.accessToken).toBe('string');
      expect(new Date(bodyOf(response).data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(refreshTokenOf(response)).toMatch(REFRESH_TOKEN_SHAPE);
      expect(refreshTokenOf(response)).not.toBe(bodyOf(response).data.accessToken);
      expect(setCookies(response)).toEqual([]);

      const me = await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(response).data.accessToken}`)
        .expect(200);
      expect(bodyOf(me)).toMatchObject({
        success: true,
        message: 'ME.RETRIEVED',
        data: {
          appUserId: seed.superAdmin.appUserId,
          loginEmail: seed.superAdmin.email,
          employee: {
            id: seed.superAdmin.employeeId,
            employeeCode: 'E-ADMIN',
            department: { code: 'P-OPS', name: 'Operations' },
            jobTitle: 'Administrator',
          },
          roles: ['SUPER_ADMIN'],
          managerScope: null,
        },
      });
    });

    it('returns the stored expiry of the issued refresh token next to the access-token expiry, with TTLs unchanged', async () => {
      const before = Date.now();
      const response = await loginAdmin();
      const after = Date.now();
      const data = bodyOf(response).data;

      expect(new Date(data.refreshExpiresAt).toISOString()).toBe(data.refreshExpiresAt);
      expect(new Date(data.refreshExpiresAt)).toEqual((await storedToken(data.refreshToken)).expires_at);
      // Defaults: access token 600 s, refresh token = idle TTL 28 800 s (the absolute TTL is longer).
      const expiresAt = new Date(data.expiresAt).getTime();
      const refreshExpiresAt = new Date(data.refreshExpiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 600_000);
      expect(expiresAt).toBeLessThanOrEqual(after + 600_000);
      expect(refreshExpiresAt).toBeGreaterThanOrEqual(before + 28_800_000);
      expect(refreshExpiresAt).toBeLessThanOrEqual(after + 28_800_000);
    });

    it('requires a token for /me', async () => {
      const response = await request(server()).get('/api/v1/me').expect(401);
      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects a forged token signed with another secret', async () => {
      const forged =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwic2lkIjoieSJ9.' +
        Buffer.from('not-a-real-signature').toString('base64url');
      const response = await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${forged}`).expect(401);
      expect(bodyOf(response).error.code).toBe('INVALID_ACCESS_TOKEN');
    });
  });

  describe('US-01-01 AC-10: one answer for every failure', () => {
    it('answers identically for an unknown email, an invited account and a wrong password', async () => {
      await insertAccountFixture(ctx.app, seed, { code: 'E-INV', email: 'invited@acme.vn', activated: false });
      const before = await ctx.sql.query<{ users: string; grants: string }>(
        'SELECT (SELECT count(*) FROM app_users) AS users, (SELECT count(*) FROM role_grants) AS grants',
      );

      const unknown = await login('nobody@acme.vn', SEED_PASSWORD).expect(401);
      const invited = await login('invited@acme.vn', SEED_PASSWORD).expect(401);
      const wrong = await login(seed.superAdmin.email, 'not the right password').expect(401);
      const malformed = await login('not an email', SEED_PASSWORD).expect(401);

      const normalize = (body: { error: Record<string, unknown> }) => ({ ...body.error, requestId: 'x' });
      for (const other of [invited, wrong, malformed]) {
        expect(bodyOf(other).error.code).toBe('AUTH.INVALID_CREDENTIALS');
        expect(normalize(bodyOf(other))).toEqual(normalize(bodyOf(unknown)));
      }
      expect(setCookies(unknown)).toEqual([]);

      const after = await ctx.sql.query<{ users: string; grants: string }>(
        'SELECT (SELECT count(*) FROM app_users) AS users, (SELECT count(*) FROM role_grants) AS grants',
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it('rejects unknown body fields with 422', async () => {
      const response = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'a@b.vn', password: 'x', role: 'SUPER_ADMIN' })
        .expect(422);
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('US-01-10 AC-6: a locked account or departed employee is refused from the next request', () => {
    it.each([
      [
        'the account is locked',
        `UPDATE app_users SET status = 'LOCKED' WHERE login_email = $1`,
        `UPDATE app_users SET status = 'ACTIVE' WHERE login_email = $1`,
      ],
      [
        'the employee has left',
        `UPDATE employees SET status = 'TERMINATED' WHERE work_email = $1`,
        `UPDATE employees SET status = 'ACTIVE' WHERE work_email = $1`,
      ],
    ])('when %s', async (_name, breakIt, fixIt) => {
      const email = `victim-${Math.random().toString(16).slice(2)}@acme.vn`;
      await insertAccountFixture(ctx.app, seed, { code: `E-${email.slice(7, 13)}`, email, activated: true });
      const session = await login(email, SEED_PASSWORD).expect(200);
      const token = bodyOf(session).data.accessToken;
      const refreshToken = refreshTokenOf(session);
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);

      await ctx.sql.query(breakIt, [email]);

      const me = await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(401);
      expect(bodyOf(me).error.code).toBe('INVALID_ACCESS_TOKEN');
      await refresh(refreshToken).expect(401);
      await login(email, SEED_PASSWORD).expect(401);

      await ctx.sql.query(fixIt, [email]);
    });

    it('revoking a session takes effect on the very next request', async () => {
      const session = await loginAdmin();
      const token = bodyOf(session).data.accessToken;
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);

      await ctx.sql.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'LOGOUT'");

      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });

  describe('US-01-10 AC-7: temporary refusal after repeated failures', () => {
    it('blocks the sixth attempt even with the right password, without locking the account', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await login(seed.superAdmin.email, `wrong password ${attempt}`).expect(401);
      }

      const blocked = await login(seed.superAdmin.email, SEED_PASSWORD).expect(429);
      expect(bodyOf(blocked).error.code).toBe('AUTH.LOGIN_TEMPORARILY_BLOCKED');
      expect(bodyOf(blocked).error.details.retryAfterSeconds).toBeGreaterThan(0);

      const account = await ctx.sql.query<{ status: string }>('SELECT status FROM app_users WHERE id = $1', [
        seed.superAdmin.appUserId,
      ]);
      expect(account.rows[0].status).toBe('ACTIVE');

      await ctx.sql.query(`UPDATE login_throttles SET blocked_until = now() - interval '1 second'`);
      await loginAdmin();
    });

    // R-06 (Owner, 14/10/2026): only a wrong attempt raises the failure counter. An attempt still
    // being checked, or one that succeeds, is not a failure. Overload protection for a burst of
    // guesses is a separate mechanism that needs its own design and review.
    it('counts every parallel wrong guess exactly once and then refuses the right password', async () => {
      const statuses = (
        await Promise.all(Array.from({ length: 12 }, (_, i) => login(seed.superAdmin.email, `wrong guess number ${i}`)))
      ).map((response) => response.status);

      expect(statuses.every((status) => status === 401 || status === 429)).toBe(true);
      const { rows } = await ctx.sql.query<{ failure_count: number }>('SELECT failure_count FROM login_throttles');
      expect(rows[0].failure_count).toBe(statuses.filter((status) => status === 401).length);
      expect(rows[0].failure_count).toBeGreaterThanOrEqual(5);
      await login(seed.superAdmin.email, SEED_PASSWORD).expect(429);
    });

    it('does not let simultaneous correct sign-ins block each other', async () => {
      const statuses = (
        await Promise.all(Array.from({ length: 8 }, () => login(seed.superAdmin.email, SEED_PASSWORD)))
      ).map((response) => response.status);

      expect(statuses).toEqual(Array.from({ length: 8 }, () => 200));
      const { rows } = await ctx.sql.query('SELECT 1 FROM login_throttles');
      expect(rows).toHaveLength(0);
    });

    it('keeps correct and wrong attempts apart when they arrive together', async () => {
      const attempts = [
        ...Array.from({ length: 3 }, (_, i) => ({ password: `wrong mix ${i}`, expected: 401 })),
        ...Array.from({ length: 7 }, () => ({ password: SEED_PASSWORD, expected: 200 })),
      ];

      const statuses = (await Promise.all(attempts.map((a) => login(seed.superAdmin.email, a.password)))).map(
        (response) => response.status,
      );

      expect(statuses).toEqual(attempts.map((a) => a.expected));
      // At most the three wrong ones were counted (a success clears the counter), never ten.
      const { rows } = await ctx.sql.query<{ failure_count: number }>('SELECT failure_count FROM login_throttles');
      expect(rows.length === 0 || rows[0].failure_count <= 3).toBe(true);
    });

    it('lets a correct sign-in clear earlier failures, so the block needs five new wrong attempts', async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await login(seed.superAdmin.email, `wrong before ${attempt}`).expect(401);
      }
      await loginAdmin();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await login(seed.superAdmin.email, `wrong after ${attempt}`).expect(401);
      }

      await loginAdmin();
    });

    it('also throttles an unknown email, so existence is not revealed', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await login('ghost@acme.vn', 'whatever password').expect(401);
      }
      await login('ghost@acme.vn', 'whatever password').expect(429);
    });

    it('counts two simultaneous wrong passwords as two failures', async () => {
      await Promise.all([
        login(seed.superAdmin.email, 'wrong one').expect(401),
        login(seed.superAdmin.email, 'wrong two').expect(401),
      ]);
      const { rows } = await ctx.sql.query<{ failure_count: number }>('SELECT failure_count FROM login_throttles');
      expect(rows).toEqual([{ failure_count: 2 }]);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const first = await loginAdmin();
      const oldToken = refreshTokenOf(first);

      const second = await refresh(oldToken).expect(200);

      expect(bodyOf(second)).toMatchObject({ message: 'AUTH.SESSION_REFRESHED', data: { tokenType: 'Bearer' } });
      expect(refreshTokenOf(second)).toMatch(REFRESH_TOKEN_SHAPE);
      expect(refreshTokenOf(second)).not.toBe(oldToken);
      expect(setCookies(second)).toEqual([]);
      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(second).data.accessToken}`)
        .expect(200);
    });

    it('returns the stored expiry of the next refresh token, not the spent one or the access token', async () => {
      const first = await loginAdmin();
      // Give the token about to be spent its own, still valid expiry, so it cannot coincide with the next one.
      await ctx.sql.query(`UPDATE refresh_tokens SET expires_at = now() + interval '1 hour' WHERE token_hash = $1`, [
        sha256(refreshTokenOf(first)),
      ]);
      const spent = await storedToken(refreshTokenOf(first));

      const second = await refresh(refreshTokenOf(first)).expect(200);
      const data = bodyOf(second).data;

      const next = await storedToken(data.refreshToken);
      expect(new Date(data.refreshExpiresAt)).toEqual(next.expires_at);
      expect(next.session_id).toBe(spent.session_id);
      expect(data.refreshExpiresAt).not.toBe(spent.expires_at.toISOString());
      expect(data.refreshExpiresAt).not.toBe(data.expiresAt);
    });

    it('caps the next refresh token at the absolute session expiry and returns exactly that value', async () => {
      const first = await loginAdmin();
      const { session_id: sessionId } = await storedToken(refreshTokenOf(first));
      const { rows } = await ctx.sql.query<{ absolute_expires_at: Date }>(
        `UPDATE auth_sessions SET absolute_expires_at = date_trunc('milliseconds', now()) + interval '90 seconds'
         WHERE id = $1 RETURNING absolute_expires_at`,
        [sessionId],
      );

      const second = await refresh(refreshTokenOf(first)).expect(200);
      const data = bodyOf(second).data;

      expect(new Date(data.refreshExpiresAt)).toEqual(rows[0].absolute_expires_at);
      expect((await storedToken(data.refreshToken)).expires_at).toEqual(rows[0].absolute_expires_at);
    });

    it('treats a replayed token as theft: 401, session revoked, exactly one committed audit row', async () => {
      const first = await loginAdmin();
      const oldToken = refreshTokenOf(first);
      const second = await refresh(oldToken).expect(200);
      const newToken = refreshTokenOf(second);

      const replay = await refresh(oldToken).expect(401);
      expect(bodyOf(replay).error.code).toBe('AUTH.SESSION_INVALID');
      expect(bodyOf(replay).data).toBeUndefined();
      expect(setCookies(replay)).toEqual([]);

      // The rotated token belongs to the same, now revoked, session.
      await refresh(newToken).expect(401);
      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(second).data.accessToken}`)
        .expect(401);

      // The event of this session only, so a revoke elsewhere in the database neither satisfies nor breaks it (CP0-05).
      const audit = await ctx.sql.query(
        `SELECT actor_kind, action, resource_type, after FROM audit_events
          WHERE action = 'SESSION.REVOKED' AND resource_id = $1`,
        [(await storedToken(oldToken)).session_id],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        actor_kind: 'SYSTEM',
        resource_type: 'AuthSession',
        after: { revoked: true, reason: 'REPLAY_DETECTED' },
      });
      await ctx.sql.query('DELETE FROM auth_sessions WHERE false');
    });

    it('rejects an expired consumed token without revoking its live successor or minting a token', async () => {
      const first = await loginAdmin();
      const oldToken = refreshTokenOf(first);
      const second = await refresh(oldToken).expect(200);
      const nextToken = refreshTokenOf(second);
      const oldHash = createHash('sha256').update(oldToken).digest('hex');
      const { rows } = await ctx.sql.query<{ session_id: string }>(
        `UPDATE refresh_tokens SET expires_at = now() - interval '1 second'
         WHERE token_hash = $1 AND consumed_at IS NOT NULL RETURNING session_id`,
        [oldHash],
      );
      expect(rows).toHaveLength(1);
      const sessionId = rows[0].session_id;
      const snapshot = async () => ({
        session: (await ctx.sql.query('SELECT * FROM auth_sessions WHERE id = $1', [sessionId])).rows,
        tokens: (
          await ctx.sql.query('SELECT * FROM refresh_tokens WHERE session_id = $1 ORDER BY token_hash', [sessionId])
        ).rows,
        audit: (
          await ctx.sql.query(`SELECT id FROM audit_events WHERE action = 'SESSION.REVOKED' AND resource_id = $1`, [
            sessionId,
          ])
        ).rows,
      });
      const before = await snapshot();
      expect(before.session[0]).toMatchObject({ revoked_at: null });
      expect(before.audit).toHaveLength(0);

      const rejected = await refresh(oldToken).expect(401);
      expect(bodyOf(rejected).error.code).toBe('AUTH.SESSION_INVALID');
      expect(bodyOf(rejected).data).toBeUndefined();
      expect(await snapshot()).toEqual(before);

      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(second).data.accessToken}`)
        .expect(200);
      await refresh(nextToken).expect(200);
      expect((await snapshot()).audit).toHaveLength(0);
    });

    it('rejects an expired unconsumed token without changing the session or minting a token', async () => {
      const first = await loginAdmin();
      const token = refreshTokenOf(first);
      const hash = createHash('sha256').update(token).digest('hex');
      const { rows } = await ctx.sql.query<{ session_id: string }>(
        `UPDATE refresh_tokens SET expires_at = now() - interval '1 second'
         WHERE token_hash = $1 AND consumed_at IS NULL RETURNING session_id`,
        [hash],
      );
      expect(rows).toHaveLength(1);
      const sessionId = rows[0].session_id;
      const readState = async () => ({
        session: (await ctx.sql.query('SELECT * FROM auth_sessions WHERE id = $1', [sessionId])).rows,
        tokens: (await ctx.sql.query('SELECT * FROM refresh_tokens WHERE session_id = $1', [sessionId])).rows,
        audit: (
          await ctx.sql.query(`SELECT id FROM audit_events WHERE action = 'SESSION.REVOKED' AND resource_id = $1`, [
            sessionId,
          ])
        ).rows,
      });
      const before = await readState();
      const rejected = await refresh(token).expect(401);
      expect(bodyOf(rejected).error.code).toBe('AUTH.SESSION_INVALID');
      expect(bodyOf(rejected).data).toBeUndefined();
      expect(await readState()).toEqual(before);
      expect(before.audit).toHaveLength(0);
      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(first).data.accessToken}`)
        .expect(200);
    });

    it('rejects a malformed or unknown refresh token with the same answer', async () => {
      for (const refreshToken of ['short', 'A'.repeat(43)]) {
        const response = await refresh(refreshToken).expect(401);
        expect(bodyOf(response).error.code).toBe('AUTH.SESSION_INVALID');
      }
    });

    it('rejects a request without a refresh token in the body, and ignores a cookie', async () => {
      const session = await loginAdmin();

      for (const send of [{}, { refreshToken: '' }, { refreshToken: refreshTokenOf(session), extra: true }]) {
        const response = await request(server())
          .post('/api/v1/auth/refresh')
          .set('Cookie', `slm_refresh=${refreshTokenOf(session)}`)
          .send(send)
          .expect(422);
        expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects a session past its absolute lifetime', async () => {
      const session = await loginAdmin();
      await ctx.sql.query(`UPDATE auth_sessions SET absolute_expires_at = now() - interval '1 second'`);

      const response = await refresh(refreshTokenOf(session)).expect(401);
      expect(bodyOf(response).error.code).toBe('AUTH.SESSION_INVALID');
    });
  });

  describe('logout contract', () => {
    it('revokes exactly the session of the refresh token and returns 204', async () => {
      const first = await loginAdmin();
      const other = await loginAdmin();

      const response = await logout(refreshTokenOf(first)).expect(204);
      expect(setCookies(response)).toEqual([]);

      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(first).data.accessToken}`)
        .expect(401);
      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(other).data.accessToken}`)
        .expect(200);
      const reasons = await ctx.sql.query(`SELECT revoked_reason FROM auth_sessions WHERE revoked_at IS NOT NULL`);
      expect(reasons.rows).toContainEqual({ revoked_reason: 'LOGOUT' });
    });

    it('is idempotent: repeating, or using a stale, malformed or unknown refresh token, is 204', async () => {
      const first = await loginAdmin();
      const token = refreshTokenOf(first);
      await logout(token).expect(204);

      for (const value of [token, 'short', 'A'.repeat(43)]) {
        await logout(value).expect(204);
      }
    });

    it('needs the refresh token in the body: a Bearer token alone, or a cookie, ends nothing', async () => {
      const session = await loginAdmin();
      const bearer = { Authorization: `Bearer ${bodyOf(session).data.accessToken}` };

      const noBody = await request(server()).post('/api/v1/auth/logout').set(bearer).send({}).expect(422);
      expect(bodyOf(noBody).error.code).toBe('VALIDATION_ERROR');
      await request(server())
        .post('/api/v1/auth/logout')
        .set('Cookie', `slm_refresh=${refreshTokenOf(session)}`)
        .send({})
        .expect(422);

      await request(server()).get('/api/v1/me').set(bearer).expect(200);
    });

    it('signs out even when the account is locked or the employee has left', async () => {
      const email = `leaver-${Math.random().toString(16).slice(2)}@acme.vn`;
      const { appUserId } = await insertAccountFixture(ctx.app, seed, {
        code: `E-L${email.slice(7, 12)}`,
        email,
        activated: true,
      });
      const session = await login(email, SEED_PASSWORD).expect(200);
      await ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [appUserId]);

      await logout(refreshTokenOf(session)).expect(204);

      const { rows } = await ctx.sql.query(
        `SELECT revoked_reason FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NOT NULL`,
        [appUserId],
      );
      expect(rows).toEqual([{ revoked_reason: 'LOGOUT' }]);
    });
  });

  describe('US-01-10 AC-9: no secrets in the audit trail or the logs', () => {
    it('keeps passwords, hashes and tokens out of audit rows and application output', async () => {
      const writes: string[] = [];
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      });
      let accessToken = '';
      let refreshToken = '';
      let rotatedAccessToken = '';
      let rotatedRefreshToken = '';
      try {
        const session = await loginAdmin();
        accessToken = bodyOf(session).data.accessToken;
        refreshToken = refreshTokenOf(session);
        await login(seed.superAdmin.email, 'a wrong password for logging').expect(401);
        const rotated = await refresh(refreshToken).expect(200);
        rotatedAccessToken = bodyOf(rotated).data.accessToken;
        rotatedRefreshToken = refreshTokenOf(rotated);
        await refresh(refreshToken);
      } finally {
        spy.mockRestore();
      }

      const audit = JSON.stringify((await ctx.sql.query('SELECT * FROM audit_events')).rows);
      const hash = (await ctx.sql.query<{ hash: string }>('SELECT hash FROM password_credentials LIMIT 1')).rows[0]
        .hash;
      const everything = audit + writes.join('');
      const secrets = [
        SEED_PASSWORD,
        'a wrong password for logging',
        hash,
        accessToken,
        refreshToken,
        rotatedAccessToken,
        rotatedRefreshToken,
      ];
      for (const secret of secrets) {
        expect(everything).not.toContain(secret);
      }
    });
  });

  it('leaves placement coverage intact', async () => {
    await expect(findPlacementCoverageViolations(ctx.sql)).resolves.toEqual([]);
  });
});
