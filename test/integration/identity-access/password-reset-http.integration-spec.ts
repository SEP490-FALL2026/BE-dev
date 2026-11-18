import { PasswordHasher } from '../../../src/modules/identity-access/credentials/password-hasher.service';
import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import { SEED_PASSWORD } from '../../support/http-test-app';
import { PasswordSelfServiceHarness, hashOf, refreshTokenOf } from '../../support/password-self-service-harness';

describe('password self-service over HTTP (integration, real PostgreSQL): reset password', () => {
  const h = new PasswordSelfServiceHarness();
  const { server, newAccount, freshAddress, issueLink, mailFor } = h;

  beforeAll(async () => {
    await h.start();
  }, 90000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('reset password (US-01-10 AC-4, AC-6, AC-7, AC-9, AC-12)', () => {
    const NEW_PASSWORD = 'a brand new passphrase 42';

    const reset = (token: string, newPassword: string = NEW_PASSWORD) =>
      request(server())
        .post('/api/v1/auth/password-resets')
        .set('X-Forwarded-For', freshAddress())
        .send({ token, newPassword });

    const login = (email: string, password: string) =>
      request(server()).post('/api/v1/auth/login').send({ email, password });

    const adminToken = async () =>
      bodyOf(await login(h.seed.superAdmin.email, SEED_PASSWORD).expect(200)).data.accessToken;

    const stateOf = async (appUserId: string) =>
      (
        await h.ctx.sql.query(
          `SELECT (SELECT status FROM app_users WHERE id = $1) AS status,
                  (SELECT activation_state FROM app_users WHERE id = $1) AS activation_state,
                  (SELECT email_verification_source FROM app_users WHERE id = $1) AS verification,
                  (SELECT array_agg(role ORDER BY role) FROM role_grants WHERE app_user_id = $1 AND revoked_at IS NULL) AS roles,
                  (SELECT e.status FROM employees e JOIN app_users a ON a.employee_id = e.id WHERE a.id = $1) AS employee`,
          [appUserId],
        )
      ).rows[0] as Record<string, unknown>;

    it('sets the new password, ends every session, and changes nothing else about the account', async () => {
      const account = await newAccount();
      const signedIn = await login(account.email, SEED_PASSWORD).expect(200);
      const accessToken = bodyOf(signedIn).data.accessToken;
      const refreshToken = refreshTokenOf(signedIn);
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
      const before = await stateOf(account.appUserId);
      const link = await issueLink(account);

      const response = await reset(link).expect(200);

      expect(bodyOf(response)).toEqual({
        success: true,
        message: 'AUTH.PASSWORD_RESET',
        data: { passwordReset: true },
      });
      // No session is issued: the owner signs in afterwards.
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await stateOf(account.appUserId)).toEqual(before);

      // The link is spent, and the mail that carried it is not left waiting to be sent.
      expect(bodyOf(await reset(link).expect(400)).error.code).toBe('AUTH.PASSWORD_RESET_INVALID');
      expect(await mailFor(hashOf(link))).toEqual([
        { status: 'CANCELLED', recipient: account.email, template: 'PASSWORD_RESET' },
      ]);
      // The old sessions are gone, at the very next request.
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
      const stale = await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
      expect(bodyOf(stale).error.code).toBe('INVALID_ACCESS_TOKEN');
      const sessions = await h.ctx.sql.query<{ revoked_reason: string | null }>(
        'SELECT revoked_reason FROM auth_sessions WHERE app_user_id = $1',
        [account.appUserId],
      );
      expect(sessions.rows).toEqual([{ revoked_reason: 'PASSWORD_RESET' }]);
      // Only the new password works.
      await login(account.email, SEED_PASSWORD).expect(401);
      await login(account.email, NEW_PASSWORD).expect(200);
    });

    it('spends no Argon2 on a link that cannot work: unknown, spent, expired, or of another purpose (R-09)', async () => {
      const hasher = h.ctx.app.get(PasswordHasher, { strict: false });
      const hash = jest.spyOn(hasher, 'hash');
      const account = await newAccount();
      const spent = await issueLink(account);
      await reset(spent).expect(200);
      const expiring = await newAccount();
      const expired = await issueLink(expiring);
      await h.ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 second' WHERE app_user_id = $1 AND purpose = 'RESET_PASSWORD'`,
        [expiring.appUserId],
      );
      const other = await newAccount();
      await h.ctx.sql.query(
        `INSERT INTO account_action_tokens (token_hash, app_user_id, purpose, expires_at)
         VALUES ($1, $2, 'INVITE', now() + interval '1 hour')`,
        [hashOf('y'.repeat(43)), other.appUserId],
      );
      const fresh = await newAccount();
      hash.mockClear();
      try {
        for (const token of ['B'.repeat(43), spent, expired, 'y'.repeat(43)]) {
          await reset(token).expect(400);
        }
        expect(hash).not.toHaveBeenCalled();

        await reset(await issueLink(fresh)).expect(200);
        expect(hash).toHaveBeenCalledTimes(1);
      } finally {
        hash.mockRestore();
      }
    });

    it('does not let a reset link activate or sign anything through the invitation route', async () => {
      const account = await newAccount();
      const link = await issueLink(account);

      const answer = await request(server())
        .post('/api/v1/auth/invitations/redeem')
        .send({ token: link, password: NEW_PASSWORD })
        .expect(400);

      expect(bodyOf(answer).error.code).toBe('AUTH.INVITATION_INVALID');
      await reset(link).expect(200);
    });

    it('gives one answer for every link that cannot be used (AC-4)', async () => {
      const account = await newAccount();
      const unknown = 'A'.repeat(43);
      const consumed = await issueLink(account);
      await reset(consumed).expect(200);
      const superseded = await issueLink(account);
      const latest = await issueLink(account);
      const expiring = await newAccount();
      const expired = await issueLink(expiring);
      // Only this account's own link is aged: other tests' links are not touched.
      await h.ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 second'
          WHERE purpose = 'RESET_PASSWORD' AND app_user_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL`,
        [expiring.appUserId],
      );
      const invitation = await newAccount();
      await h.ctx.sql.query(
        `INSERT INTO account_action_tokens (token_hash, app_user_id, purpose, expires_at)
         VALUES ($1, $2, 'INVITE', now() + interval '1 hour')`,
        [hashOf('x'.repeat(43)), invitation.appUserId],
      );

      const answers = [
        await reset('short').expect(400),
        await reset(unknown).expect(400),
        await reset(consumed).expect(400),
        await reset(superseded).expect(400),
        await reset(expired).expect(400),
        // A valid invitation token is not a reset token.
        await reset('x'.repeat(43)).expect(400),
      ];

      for (const answer of answers) {
        expect(bodyOf(answer).error).toMatchObject({ code: 'AUTH.PASSWORD_RESET_INVALID' });
        expect(bodyOf(answer).error.message).toBe(bodyOf(answers[0]).error.message);
      }
      // The latest link was never touched by the failures above.
      await reset(latest).expect(200);
    });

    it('refuses a password that breaks the policy without spending the link, and says nothing about the link first', async () => {
      const account = await newAccount();
      const link = await issueLink(account);

      for (const weak of ['too short', 'x'.repeat(129), account.email]) {
        const answer = await reset(link, weak).expect(422);
        expect(bodyOf(answer).error.code).toBe('AUTH.PASSWORD_POLICY_VIOLATION');
      }
      // A weak password with a bad link gets the policy answer, so it reveals nothing about the link.
      expect(bodyOf(await reset('A'.repeat(43), 'too short').expect(422)).error.code).toBe(
        'AUTH.PASSWORD_POLICY_VIOLATION',
      );
      const stillUsable = await h.ctx.sql.query(
        `SELECT 1 FROM account_action_tokens WHERE purpose = 'RESET_PASSWORD' AND app_user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
        [account.appUserId],
      );
      expect(stillUsable.rows).toHaveLength(1);
      await reset(link).expect(200);
    });

    it('rejects a malformed body with 422', async () => {
      for (const body of [{}, { token: 'x' }, { newPassword: NEW_PASSWORD }, { token: 'x', newPassword: '' }]) {
        const response = await request(server())
          .post('/api/v1/auth/password-resets')
          .set('X-Forwarded-For', freshAddress())
          .send(body)
          .expect(422);
        expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('does not honour a link once the account is locked, and unlocking does not bring it back (AC-6)', async () => {
      const account = await newAccount();
      const link = await issueLink(account);
      const token = await adminToken();

      await request(server())
        .post(`/api/v1/app-users/${account.appUserId}/lock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Locking revokes the reset link' })
        .expect(200);
      expect(bodyOf(await reset(link).expect(400)).error.code).toBe('AUTH.PASSWORD_RESET_INVALID');
      await request(server())
        .post(`/api/v1/app-users/${account.appUserId}/unlock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Unlocking must not revive the old link' })
        .expect(200);

      expect(bodyOf(await reset(link).expect(400)).error.code).toBe('AUTH.PASSWORD_RESET_INVALID');
      // A reset never unlocks an account: it stays as the administrator left it.
      await login(account.email, SEED_PASSWORD).expect(200);
    });

    it('does not honour a link for an employee who has left, and does not touch the account (AC-6)', async () => {
      const account = await newAccount();
      const link = await issueLink(account);
      // Fixture only: the offboarding flow that terminates an employee belongs to G6.
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [account.employeeId]);
      const before = await h.ctx.sql.query('SELECT hash FROM password_credentials WHERE app_user_id = $1', [
        account.appUserId,
      ]);

      expect(bodyOf(await reset(link).expect(400)).error.code).toBe('AUTH.PASSWORD_RESET_INVALID');

      const after = await h.ctx.sql.query('SELECT hash FROM password_credentials WHERE app_user_id = $1', [
        account.appUserId,
      ]);
      expect(after.rows).toEqual(before.rows);
      await login(account.email, NEW_PASSWORD).expect(401);
    });

    it('lifts a temporary block on sign-in at once, without unlocking anything (AC-7)', async () => {
      const account = await newAccount();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await login(account.email, 'definitely not the password').expect(401);
      }
      expect(bodyOf(await login(account.email, SEED_PASSWORD).expect(429)).error.code).toBe(
        'AUTH.LOGIN_TEMPORARILY_BLOCKED',
      );

      const link = await issueLink(account);
      await reset(link).expect(200);

      await login(account.email, NEW_PASSWORD).expect(200);
      expect((await stateOf(account.appUserId)).status).toBe('ACTIVE');
    });

    it('queues exactly one notice, to the stored email, carrying no link and no secret (AC-12)', async () => {
      const account = await newAccount('Notice.Target@acme.vn');
      const link = await issueLink(account);
      await reset(link).expect(200);

      const notices = await h.ctx.sql.query<{
        id: string;
        status: string;
        recipient: string;
        action_token_hash: string | null;
        payload_ciphertext: Buffer;
        payload_key_id: string;
      }>(
        `SELECT id, status, recipient, action_token_hash, payload_ciphertext, payload_key_id
           FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' AND recipient = $1`,
        [account.email],
      );

      expect(notices.rows).toHaveLength(1);
      expect(notices.rows[0]).toMatchObject({ status: 'PENDING', action_token_hash: null });
      const payload = h.cipher.decrypt(
        notices.rows[0].id,
        notices.rows[0].payload_key_id,
        notices.rows[0].payload_ciphertext,
      );
      expect(Object.keys(payload).sort()).toEqual(['at', 'event', 'fullName']);
      expect(payload.event).toBe('PASSWORD_RESET');
      expect(JSON.stringify(payload)).not.toContain(link);
    });

    it('records nothing when the reset fails, and keeps secrets out of the audit trail when it succeeds (AC-9)', async () => {
      const account = await newAccount();
      const link = await issueLink(account);
      const eventsBefore = await h.ctx.sql.query('SELECT count(*)::int AS n FROM audit_events WHERE resource_id = $1', [
        account.appUserId,
      ]);
      await reset('A'.repeat(43)).expect(400);
      await reset(link, 'short').expect(422);
      const afterFailures = await h.ctx.sql.query(
        'SELECT count(*)::int AS n FROM audit_events WHERE resource_id = $1',
        [account.appUserId],
      );
      expect(afterFailures.rows).toEqual(eventsBefore.rows);
      const noticesBefore = await h.ctx.sql.query(
        `SELECT count(*)::int AS n FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' AND recipient = $1`,
        [account.email],
      );
      expect(noticesBefore.rows[0]).toEqual({ n: 0 });

      await reset(link).expect(200);

      const events = await h.ctx.sql.query<{
        after: Record<string, unknown>;
        actor_kind: string;
        actor_app_user_id: string;
      }>(
        `SELECT after, actor_kind, actor_app_user_id FROM audit_events WHERE action = 'APP_USER.PASSWORD_RESET' AND resource_id = $1`,
        [account.appUserId],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0]).toMatchObject({ actor_kind: 'USER', actor_app_user_id: account.appUserId });
      expect(Object.keys(events.rows[0].after).sort()).toEqual(['at', 'event']);
      const everything = JSON.stringify(
        (await h.ctx.sql.query('SELECT * FROM audit_events WHERE resource_id = $1', [account.appUserId])).rows,
      );
      for (const secret of [link, hashOf(link), NEW_PASSWORD, SEED_PASSWORD]) expect(everything).not.toContain(secret);
    });
  });
});
