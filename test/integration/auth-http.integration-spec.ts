import request from 'supertest';
import { bodyOf } from '../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../support/http-test-app';
import { findPlacementCoverageViolations } from '../support/placement-coverage';

const REFRESH_COOKIE = 'slm_refresh';

function setCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown;
  if (Array.isArray(header)) return header as string[];
  return typeof header === 'string' ? [header] : [];
}

function refreshCookie(response: request.Response): string | undefined {
  return setCookies(response).find((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`));
}

function cookieValue(cookie: string): string {
  return cookie.split(';')[0].slice(REFRESH_COOKIE.length + 1);
}

describe('authentication over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  const server = () => ctx.app.getHttpServer();

  const login = (email: string, password: string) =>
    request(server()).post('/api/v1/auth/login').send({ email, password });
  const loginAdmin = () => login(seed.superAdmin.email, SEED_PASSWORD).expect(200);

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

  describe('login and /me', () => {
    it('signs the Super Admin in, sets a hardened refresh cookie and serves /me', async () => {
      const response = await loginAdmin();

      expect(bodyOf(response)).toMatchObject({
        success: true,
        message: 'AUTH.LOGGED_IN',
        data: { tokenType: 'Bearer' },
      });
      expect(typeof bodyOf(response).data.accessToken).toBe('string');
      expect(new Date(bodyOf(response).data.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const cookie = refreshCookie(response);
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/Max-Age=\d+/);
      expect(JSON.stringify(bodyOf(response))).not.toContain(cookieValue(cookie as string));

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
          roles: { direct: ['SUPER_ADMIN'], derived: [], effective: ['SUPER_ADMIN'] },
          selfServiceOnly: false,
        },
      });
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
      const cookie = cookieValue(refreshCookie(session) as string);
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);

      await ctx.sql.query(breakIt, [email]);

      const me = await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(401);
      expect(bodyOf(me).error.code).toBe('INVALID_ACCESS_TOKEN');
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${cookie}`).expect(401);
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
      const oldCookie = cookieValue(refreshCookie(first) as string);

      const second = await request(server())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${oldCookie}`)
        .expect(200);

      expect(bodyOf(second)).toMatchObject({ message: 'AUTH.SESSION_REFRESHED', data: { tokenType: 'Bearer' } });
      const newCookie = cookieValue(refreshCookie(second) as string);
      expect(newCookie).not.toBe(oldCookie);
      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(second).data.accessToken}`)
        .expect(200);
    });

    it('treats a replayed token as theft: 401, session revoked, exactly one committed audit row', async () => {
      const first = await loginAdmin();
      const oldCookie = cookieValue(refreshCookie(first) as string);
      const second = await request(server())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${oldCookie}`)
        .expect(200);
      const newCookie = cookieValue(refreshCookie(second) as string);

      const replay = await request(server())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${oldCookie}`)
        .expect(401);
      expect(bodyOf(replay).error.code).toBe('AUTH.SESSION_INVALID');
      expect(refreshCookie(replay)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);

      // The rotated token belongs to the same, now revoked, session.
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${newCookie}`).expect(401);
      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(second).data.accessToken}`)
        .expect(401);

      const audit = await ctx.sql.query(
        `SELECT actor_kind, action, resource_type, after FROM audit_events WHERE action = 'SESSION.REVOKED'`,
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        actor_kind: 'SYSTEM',
        resource_type: 'AuthSession',
        after: { revoked: true, reason: 'REPLAY_DETECTED' },
      });
      await ctx.sql.query('DELETE FROM auth_sessions WHERE false');
    });

    it('rejects a missing, malformed or unknown cookie and clears it', async () => {
      for (const cookie of [undefined, `${REFRESH_COOKIE}=short`, `${REFRESH_COOKIE}=${'A'.repeat(43)}`]) {
        const req = request(server()).post('/api/v1/auth/refresh');
        const response = await (cookie ? req.set('Cookie', cookie) : req).expect(401);
        expect(bodyOf(response).error.code).toBe('AUTH.SESSION_INVALID');
        expect(refreshCookie(response)).toBeDefined();
      }
    });

    it('rejects a session past its absolute lifetime and clears the cookie', async () => {
      const session = await loginAdmin();
      const cookie = cookieValue(refreshCookie(session) as string);
      await ctx.sql.query(`UPDATE auth_sessions SET absolute_expires_at = now() - interval '1 second'`);

      const response = await request(server())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${cookie}`)
        .expect(401);
      expect(refreshCookie(response)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('logout contract', () => {
    const logout = (cookie?: string) => {
      const req = request(server()).post('/api/v1/auth/logout');
      return cookie ? req.set('Cookie', `${REFRESH_COOKIE}=${cookie}`) : req;
    };
    const expectCleared = (response: request.Response) =>
      expect(refreshCookie(response)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);

    it('revokes exactly the session of the cookie and returns 204', async () => {
      const first = await loginAdmin();
      const other = await loginAdmin();
      const cookie = cookieValue(refreshCookie(first) as string);

      const response = await logout(cookie).expect(204);
      expectCleared(response);

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

    it('is idempotent: repeating, or using a stale, malformed or unknown cookie, is 204 and clears it', async () => {
      const first = await loginAdmin();
      const cookie = cookieValue(refreshCookie(first) as string);
      await logout(cookie).expect(204);

      for (const value of [cookie, 'short', 'A'.repeat(43), undefined]) {
        expectCleared(await logout(value).expect(204));
      }
    });

    it('does not use a Bearer token and does not revoke anything without the cookie', async () => {
      const session = await loginAdmin();
      await request(server())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${bodyOf(session).data.accessToken}`)
        .expect(204);

      await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${bodyOf(session).data.accessToken}`)
        .expect(200);
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

      await logout(cookieValue(refreshCookie(session) as string)).expect(204);

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
      try {
        const session = await loginAdmin();
        accessToken = bodyOf(session).data.accessToken;
        refreshToken = cookieValue(refreshCookie(session) as string);
        await login(seed.superAdmin.email, 'a wrong password for logging').expect(401);
        await request(server()).post('/api/v1/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);
        await request(server()).post('/api/v1/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);
      } finally {
        spy.mockRestore();
      }

      const audit = JSON.stringify((await ctx.sql.query('SELECT * FROM audit_events')).rows);
      const hash = (await ctx.sql.query<{ hash: string }>('SELECT hash FROM password_credentials LIMIT 1')).rows[0]
        .hash;
      const everything = audit + writes.join('');
      for (const secret of [SEED_PASSWORD, 'a wrong password for logging', hash, accessToken, refreshToken]) {
        expect(everything).not.toContain(secret);
      }
    });
  });

  it('leaves placement coverage intact', async () => {
    await expect(findPlacementCoverageViolations(ctx.sql)).resolves.toEqual([]);
  });
});
