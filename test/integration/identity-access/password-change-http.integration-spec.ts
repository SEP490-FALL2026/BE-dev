import { Logger } from '@nestjs/common';
import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import { SEED_PASSWORD } from '../../support/http-test-app';
import { PasswordSelfServiceHarness, hashOf, refreshTokenOf } from '../../support/password-self-service-harness';

describe('password self-service over HTTP (integration, real PostgreSQL): the application log and change password', () => {
  const h = new PasswordSelfServiceHarness();
  const { server, newAccount, freshAddress, forgot, issueLink } = h;

  beforeAll(async () => {
    await h.start();
  }, 90000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('the application log (US-01-10 AC-9)', () => {
    it('carries no token, password, hash or typed email, whatever the outcome', async () => {
      const account = await newAccount('Logged.Case@acme.vn');
      const session = bodyOf(
        await request(server())
          .post('/api/v1/auth/login')
          .send({ email: account.email, password: SEED_PASSWORD })
          .expect(200),
      ).data.accessToken;
      const written: string[] = [];
      const capture = (chunk: unknown) => {
        written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));

        return true;
      };
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
      const typedAbsent = 'ghost.logger@acme.vn';
      let link = '';
      try {
        // A probe, so a silent capture cannot make this test pass for the wrong reason.
        new Logger('probe').error('probe-marker');
        await forgot('  logged.case@ACME.vn ').expect(202);
        await forgot(typedAbsent).expect(202);
        link = await issueLink(account);
        await request(server())
          .post('/api/v1/auth/password-resets')
          .set('X-Forwarded-For', freshAddress())
          .send({ token: 'A'.repeat(43), newPassword: 'wrong guess nope 99' })
          .expect(400);
        await request(server())
          .post('/api/v1/auth/password-resets')
          .set('X-Forwarded-For', freshAddress())
          .send({ token: link, newPassword: 'short' })
          .expect(422);
        await request(server())
          .post('/api/v1/auth/password-resets')
          .set('X-Forwarded-For', freshAddress())
          .send({ token: link, newPassword: 'a brand new passphrase 42' })
          .expect(200);
        await request(server())
          .post('/api/v1/me/password')
          .set('Authorization', `Bearer ${session}`)
          .send({ currentPassword: 'wrong current 123', newPassword: 'x' })
          .expect(401);
      } finally {
        stdout.mockRestore();
        stderr.mockRestore();
      }
      const log = written.join('');

      expect(log).toContain('probe-marker');
      for (const secret of [
        link,
        hashOf(link),
        'a brand new passphrase 42',
        SEED_PASSWORD,
        'wrong current 123',
        'wrong guess nope 99',
        typedAbsent,
        account.email,
        'logged.case@acme.vn',
        session,
      ]) {
        expect(log).not.toContain(secret);
      }
    });
  });

  describe('change password (US-01-10 AC-5, AC-7, AC-9, AC-12)', () => {
    const NEW_PASSWORD = 'another brand new passphrase 7';

    const login = (email: string, password: string) =>
      request(server()).post('/api/v1/auth/login').send({ email, password });

    const signIn = async (email: string, password = SEED_PASSWORD) => {
      const response = await login(email, password).expect(200);

      return { accessToken: bodyOf(response).data.accessToken, refreshToken: refreshTokenOf(response) };
    };

    const change = (accessToken: string, currentPassword: string, newPassword: string = NEW_PASSWORD) =>
      request(server())
        .post('/api/v1/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword, newPassword });

    const credentialOf = async (appUserId: string) =>
      (
        await h.ctx.sql.query<{ hash: string }>('SELECT hash FROM password_credentials WHERE app_user_id = $1', [
          appUserId,
        ])
      ).rows[0].hash;

    it('replaces the password and ends every session including this one, so no refresh token works (AC-5)', async () => {
      const account = await newAccount();
      const first = await signIn(account.email);
      const second = await signIn(account.email);
      const before = await credentialOf(account.appUserId);

      const response = await change(first.accessToken, SEED_PASSWORD).expect(200);

      expect(bodyOf(response)).toEqual({
        success: true,
        message: 'AUTH.PASSWORD_CHANGED',
        data: { passwordChanged: true },
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await credentialOf(account.appUserId)).not.toEqual(before);
      // This session and the other one end at the very next request.
      for (const session of [first, second]) {
        const stale = await request(server())
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .expect(401);
        expect(bodyOf(stale).error.code).toBe('INVALID_ACCESS_TOKEN');
        await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
      }
      const reasons = await h.ctx.sql.query<{ revoked_reason: string | null }>(
        'SELECT revoked_reason FROM auth_sessions WHERE app_user_id = $1',
        [account.appUserId],
      );
      expect(reasons.rows).toEqual([{ revoked_reason: 'PASSWORD_CHANGED' }, { revoked_reason: 'PASSWORD_CHANGED' }]);
      await login(account.email, SEED_PASSWORD).expect(401);
      await login(account.email, NEW_PASSWORD).expect(200);
    });

    it('works for an account with no role at all, and for the Super Admin changing their own (AC-5, FR-8.8)', async () => {
      const account = await newAccount();
      const roles = await h.ctx.sql.query('SELECT 1 FROM role_grants WHERE app_user_id = $1', [account.appUserId]);
      expect(roles.rows).toEqual([]);
      await change((await signIn(account.email)).accessToken, SEED_PASSWORD).expect(200);

      await change((await signIn(h.seed.superAdmin.email)).accessToken, SEED_PASSWORD).expect(200);
      // Put the shared administrator back, so the other tests can sign in with the seed password.
      await change(
        (await signIn(h.seed.superAdmin.email, NEW_PASSWORD)).accessToken,
        NEW_PASSWORD,
        SEED_PASSWORD,
      ).expect(200);
    });

    it('refuses a wrong current password with 422, not 401, and leaves the session and the password alone', async () => {
      const account = await newAccount();
      const session = await signIn(account.email);
      const before = await credentialOf(account.appUserId);

      const answer = await change(session.accessToken, 'not the current password').expect(422);

      expect(bodyOf(answer).error.code).toBe('AUTH.CURRENT_PASSWORD_INVALID');
      expect(await credentialOf(account.appUserId)).toEqual(before);
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
      const events = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE resource_id = $1 AND action = 'APP_USER.PASSWORD_CHANGED'`,
        [account.appUserId],
      );
      expect(events.rows).toEqual([]);
    });

    it('counts wrong current passwords with the sign-in failures, blocks at the limit and never locks the account (AC-7)', async () => {
      const account = await newAccount();
      const session = await signIn(account.email);

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await change(session.accessToken, `wrong guess ${attempt}`).expect(422);
      }
      const blocked = await change(session.accessToken, SEED_PASSWORD).expect(429);

      expect(bodyOf(blocked).error.code).toBe('AUTH.LOGIN_TEMPORARILY_BLOCKED');
      expect(bodyOf(blocked).error.details.retryAfterSeconds).toBeGreaterThan(0);
      // One counter for the email: signing in is blocked too, and the account is still ACTIVE.
      await login(account.email, SEED_PASSWORD).expect(429);
      const status = await h.ctx.sql.query('SELECT status FROM app_users WHERE id = $1', [account.appUserId]);
      expect(status.rows).toEqual([{ status: 'ACTIVE' }]);
    });

    it('clears the failure count once the password is changed, so the owner is not left blocked (T-3)', async () => {
      const account = await newAccount();
      const session = await signIn(account.email);
      await change(session.accessToken, 'wrong guess').expect(422);
      expect((await h.ctx.sql.query('SELECT count(*)::int AS n FROM login_throttles')).rows).toEqual([{ n: 1 }]);

      await change(session.accessToken, SEED_PASSWORD).expect(200);

      expect((await h.ctx.sql.query('SELECT count(*)::int AS n FROM login_throttles')).rows).toEqual([{ n: 0 }]);
    });

    it('refuses a new password that breaks the policy, and says so before touching anything', async () => {
      const account = await newAccount();
      const session = await signIn(account.email);
      const before = await credentialOf(account.appUserId);

      for (const weak of ['too short', 'x'.repeat(129), account.email]) {
        const answer = await change(session.accessToken, SEED_PASSWORD, weak).expect(422);
        expect(bodyOf(answer).error.code).toBe('AUTH.PASSWORD_POLICY_VIOLATION');
      }

      expect(await credentialOf(account.appUserId)).toEqual(before);
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    });

    it('AUTH.2: lets the policy name a too-long new password up to 1024 characters; beyond that the body is malformed', async () => {
      const account = await newAccount();
      const session = await signIn(account.email);
      const before = await credentialOf(account.appUserId);

      for (const length of [129, 257, 1024]) {
        const answer = await change(session.accessToken, SEED_PASSWORD, 'x'.repeat(length)).expect(422);
        expect({ length, code: bodyOf(answer).error.code }).toEqual({ length, code: 'AUTH.PASSWORD_POLICY_VIOLATION' });
      }
      const oversize = await change(session.accessToken, SEED_PASSWORD, 'x'.repeat(1025)).expect(422);
      expect(bodyOf(oversize).error.code).toBe('VALIDATION_ERROR');

      expect(await credentialOf(account.appUserId)).toEqual(before);
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
    });

    it('requires a token, and rejects a malformed body with 422', async () => {
      await request(server()).post('/api/v1/me/password').send({ currentPassword: 'a', newPassword: 'b' }).expect(401);
      const account = await newAccount();
      const session = await signIn(account.email);

      for (const body of [
        {},
        { currentPassword: SEED_PASSWORD },
        { newPassword: NEW_PASSWORD },
        { currentPassword: '', newPassword: NEW_PASSWORD },
        { currentPassword: SEED_PASSWORD, newPassword: NEW_PASSWORD, extra: 1 },
      ]) {
        const response = await request(server())
          .post('/api/v1/me/password')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send(body)
          .expect(422);
        expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('is refused at the guard once the account is locked or its employee has left (AC-6)', async () => {
      const locked = await newAccount();
      const left = await newAccount();
      const lockedSession = await signIn(locked.email);
      const leftSession = await signIn(left.email);
      const admin = await signIn(h.seed.superAdmin.email);
      await request(server())
        .post(`/api/v1/app-users/${locked.appUserId}/lock`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'A locked account must not change its password' })
        .expect(200);
      // Fixture only: the offboarding flow that terminates an employee belongs to G6.
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);

      for (const session of [lockedSession, leftSession]) {
        const answer = await change(session.accessToken, SEED_PASSWORD).expect(401);
        expect(bodyOf(answer).error.code).toBe('INVALID_ACCESS_TOKEN');
      }
    });

    it('queues one notice to the stored email with no link, and keeps secrets out of the audit trail (AC-9, AC-12)', async () => {
      const account = await newAccount('Change.Target@acme.vn');
      const session = await signIn(account.email);
      await change(session.accessToken, 'wrong guess').expect(422);
      const noticesBefore = await h.ctx.sql.query(
        `SELECT 1 FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' AND recipient = $1`,
        [account.email],
      );
      expect(noticesBefore.rows).toEqual([]);

      await change(session.accessToken, SEED_PASSWORD).expect(200);

      const notices = await h.ctx.sql.query<{
        id: string;
        status: string;
        action_token_hash: string | null;
        payload_ciphertext: Buffer;
        payload_key_id: string;
      }>(
        `SELECT id, status, action_token_hash, payload_ciphertext, payload_key_id FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' AND recipient = $1`,
        [account.email],
      );
      expect(notices.rows).toHaveLength(1);
      expect(notices.rows[0]).toMatchObject({ status: 'PENDING', action_token_hash: null });
      const payload = h.cipher.decrypt(
        notices.rows[0].id,
        notices.rows[0].payload_key_id,
        notices.rows[0].payload_ciphertext,
      );
      expect(payload.event).toBe('PASSWORD_CHANGED');
      expect(Object.keys(payload).sort()).toEqual(['at', 'event', 'fullName']);

      const events = await h.ctx.sql.query<{
        after: Record<string, unknown>;
        actor_kind: string;
        actor_app_user_id: string;
      }>(
        `SELECT after, actor_kind, actor_app_user_id FROM audit_events WHERE action = 'APP_USER.PASSWORD_CHANGED' AND resource_id = $1`,
        [account.appUserId],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0]).toMatchObject({ actor_kind: 'USER', actor_app_user_id: account.appUserId });
      expect(Object.keys(events.rows[0].after).sort()).toEqual(['at', 'event']);
      const everything = JSON.stringify(
        (await h.ctx.sql.query('SELECT * FROM audit_events WHERE resource_id = $1', [account.appUserId])).rows,
      );
      for (const secret of [NEW_PASSWORD, SEED_PASSWORD, 'wrong guess', session.accessToken])
        expect(everything).not.toContain(secret);
    });
  });
});
