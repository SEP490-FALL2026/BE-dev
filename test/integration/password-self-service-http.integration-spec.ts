import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { PasswordHasher } from '../../src/modules/identity-access/accounts/password-hasher.service';
import request from 'supertest';
import { PayloadCipher } from '../../src/modules/notifications/payload-cipher';
import { bodyOf } from '../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../support/http-test-app';

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

/** The refresh token a sign-in response carries in its body. */
function refreshTokenOf(response: request.Response): string {
  return bodyOf(response).data.refreshToken;
}

interface TokenRow {
  token_hash: string;
  purpose: string;
  revoked_reason: string | null;
  revoked_at: Date | null;
  consumed_at: Date | null;
  expires_at: Date;
  created_by: string | null;
}

describe('password self-service over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let cipher: PayloadCipher;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    // One hop of trust, so each request can present its own client address: the route limit (T-9) is
    // per address, and a test run sends far more than ten requests from the one machine.
    ctx = await createHttpTestApp({ env: { TRUST_PROXY_HOPS: '1' } });
    seed = await seedInstallation(ctx.app);
    cipher = ctx.app.get(PayloadCipher, { strict: false });
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  afterEach(async () => {
    await ctx.sql.query('DELETE FROM login_throttles');
  });

  /** An activated account with its own unique email, ready to forget its password. */
  const newAccount = async (email?: string) => {
    counter += 1;
    const login = email ?? `self.service.${counter}@acme.vn`;
    const account = await insertAccountFixture(ctx.app, seed, {
      code: `E-PS${counter}`,
      email: login,
      activated: true,
    });

    return { ...account, email: login };
  };

  let clientAddress = 0;
  /** A client address no earlier request in this run has used, so the per-address route limit never interferes. */
  const freshAddress = () => {
    clientAddress += 1;

    return `10.${Math.floor(clientAddress / 250)}.${clientAddress % 250}.1`;
  };

  const forgot = (email: unknown, address = freshAddress()) =>
    request(server()).post('/api/v1/auth/password-reset-requests').set('X-Forwarded-For', address).send({ email });

  /** Asks for a link and reads the raw token the way the mail would carry it: from the sealed outbox payload. */
  const issueLink = async (account: { appUserId: string; email: string }): Promise<string> => {
    await forgot(account.email).expect(202);
    const row = (
      await ctx.sql.query<{ id: string; payload_ciphertext: Buffer; payload_key_id: string }>(
        `SELECT o.id, o.payload_ciphertext, o.payload_key_id
           FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
          WHERE t.app_user_id = $1 AND t.purpose = 'RESET_PASSWORD' AND t.revoked_at IS NULL
            AND t.consumed_at IS NULL AND o.status = 'PENDING'`,
        [account.appUserId],
      )
    ).rows[0];

    return cipher.decrypt(row.id, row.payload_key_id, row.payload_ciphertext).token as string;
  };

  const resetTokensOf = async (appUserId: string): Promise<TokenRow[]> =>
    (
      await ctx.sql.query<TokenRow>(
        `SELECT token_hash, purpose, revoked_reason, revoked_at, consumed_at, expires_at, created_by
           FROM account_action_tokens WHERE app_user_id = $1 AND purpose = 'RESET_PASSWORD' ORDER BY created_at, token_hash`,
        [appUserId],
      )
    ).rows;

  const mailFor = async (hash: string) =>
    (
      await ctx.sql.query<{ status: string; recipient: string; template: string }>(
        'SELECT status, recipient, template FROM email_outbox WHERE action_token_hash = $1',
        [hash],
      )
    ).rows;

  describe('forgot password (US-01-10 AC-3)', () => {
    it('answers every kind of account identically and queues mail only for an active, activated one', async () => {
      const usable = await newAccount('Mixed.Case@acme.vn');
      counter += 1;
      const invited = await insertAccountFixture(ctx.app, seed, {
        code: `E-PS${counter}`,
        email: `invited.${counter}@acme.vn`,
        activated: false,
      });
      const locked = await newAccount();
      await ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [locked.appUserId]);
      const left = await newAccount();
      // Fixture only: the offboarding flow that terminates an employee belongs to G6.
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);

      const answers = [
        await forgot('  mixed.case@ACME.vn  ').expect(202),
        await forgot('nobody@acme.vn').expect(202),
        await forgot(`invited.${counter}@acme.vn`).expect(202),
        await forgot(locked.email).expect(202),
        await forgot(left.email).expect(202),
      ];

      for (const answer of answers) {
        expect(bodyOf(answer)).toEqual({
          success: true,
          message: 'AUTH.PASSWORD_RESET_REQUESTED',
          data: { requested: true },
        });
      }
      const issued = await resetTokensOf(usable.appUserId);
      expect(issued).toHaveLength(1);
      expect(issued[0]).toMatchObject({ purpose: 'RESET_PASSWORD', revoked_at: null, consumed_at: null });
      // The reset link lives for the configured 30 minutes, not for an invitation's 72 hours (T-1).
      const lifetimeMs = issued[0].expires_at.getTime() - Date.now();
      expect(lifetimeMs).toBeGreaterThan(29 * 60_000);
      expect(lifetimeMs).toBeLessThanOrEqual(30 * 60_000);
      expect(issued[0].created_by).toBeNull();
      // The mail goes to the email stored on the account, not to the form the caller typed.
      expect(await mailFor(issued[0].token_hash)).toEqual([
        { status: 'PENDING', recipient: 'Mixed.Case@acme.vn', template: 'PASSWORD_RESET' },
      ]);

      for (const other of [invited.appUserId, locked.appUserId, left.appUserId]) {
        expect(await resetTokensOf(other)).toEqual([]);
      }
      const mail = await ctx.sql.query(
        `SELECT recipient FROM email_outbox WHERE template = 'PASSWORD_RESET' AND recipient = ANY($1::text[])`,
        [[locked.email, left.email, `invited.${counter}@acme.vn`, 'nobody@acme.vn']],
      );
      expect(mail.rows).toEqual([]);
    });

    it('opens no transaction for an address that cannot get a link, so it costs what an unknown address costs (AC-3)', async () => {
      const runner = ctx.app.get(TransactionRunner);
      const run = jest.spyOn(runner, 'run');
      const locked = await newAccount();
      await ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [locked.appUserId]);
      const left = await newAccount();
      // Fixture only: the offboarding flow that terminates an employee belongs to G6.
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);
      counter += 1;
      const invited = await insertAccountFixture(ctx.app, seed, {
        code: `E-PS${counter}`,
        email: `invited.nt.${counter}@acme.vn`,
        activated: false,
      });
      const usable = await newAccount();
      // The fixtures above wrote through the runner too; only what the route itself does is counted.
      run.mockClear();
      try {
        for (const email of ['nobody.here@acme.vn', locked.email, left.email, `invited.nt.${counter}@acme.vn`]) {
          await forgot(email).expect(202);
        }
        expect(run).not.toHaveBeenCalled();

        await forgot(usable.email).expect(202);
        expect(run).toHaveBeenCalledTimes(1);
      } finally {
        run.mockRestore();
      }
      expect(invited.appUserId).toBeDefined();
    });

    it('rejects a malformed body with 422 before it can say anything about any account', async () => {
      for (const body of [{}, { email: '' }, { email: 'not an email' }, { email: `${'a'.repeat(320)}@acme.vn` }]) {
        const response = await request(server())
          .post('/api/v1/auth/password-reset-requests')
          .set('X-Forwarded-For', freshAddress())
          .send(body)
          .expect(422);
        expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      }
      const extra = await request(server())
        .post('/api/v1/auth/password-reset-requests')
        .set('X-Forwarded-For', freshAddress())
        .send({ email: 'a@acme.vn', role: 'SUPER_ADMIN' })
        .expect(422);
      expect(bodyOf(extra).error.code).toBe('VALIDATION_ERROR');
    });

    it('keeps one usable link at a time and issues at most three an hour, answering the same throughout (T-2, T-4)', async () => {
      const account = await newAccount();

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const answer = await forgot(account.email).expect(202);
        expect(bodyOf(answer).data).toEqual({ requested: true });
      }

      const tokens = await resetTokensOf(account.appUserId);
      expect(tokens).toHaveLength(3);
      expect(tokens.slice(0, 2).map((token) => token.revoked_reason)).toEqual(['SUPERSEDED', 'SUPERSEDED']);
      expect(tokens[2]).toMatchObject({ revoked_at: null, consumed_at: null, revoked_reason: null });
      // One pg client: queries go one at a time (INF.1 — pg 9 drops queueing on a busy client).
      const states: Awaited<ReturnType<typeof mailFor>>[] = [];
      for (const token of tokens) states.push(await mailFor(token.token_hash));
      expect(states.map((rows) => rows.map((row) => row.status))).toEqual([['CANCELLED'], ['CANCELLED'], ['PENDING']]);
    });

    it('limits one address to ten requests a minute on this route, whatever the answer (T-9)', async () => {
      const address = freshAddress();
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await forgot('nobody@acme.vn', address).expect(202);
      }

      const refused = await forgot('nobody@acme.vn', address).expect(429);
      expect(bodyOf(refused).success).toBe(false);
      expect(bodyOf(refused).error.code).toBe('HTTP_TOO_MANY_REQUESTS');
      // Another address is not affected.
      await forgot('nobody@acme.vn', freshAddress()).expect(202);
    });

    it('never touches a password, a role, a lock or a session', async () => {
      const account = await newAccount();
      const before = await ctx.sql.query(
        `SELECT (SELECT hash FROM password_credentials WHERE app_user_id = $1) AS hash,
                (SELECT status FROM app_users WHERE id = $1) AS status,
                (SELECT count(*) FROM role_grants WHERE app_user_id = $1) AS grants,
                (SELECT count(*) FROM auth_sessions WHERE app_user_id = $1) AS sessions`,
        [account.appUserId],
      );

      await forgot(account.email).expect(202);

      const after = await ctx.sql.query(
        `SELECT (SELECT hash FROM password_credentials WHERE app_user_id = $1) AS hash,
                (SELECT status FROM app_users WHERE id = $1) AS status,
                (SELECT count(*) FROM role_grants WHERE app_user_id = $1) AS grants,
                (SELECT count(*) FROM auth_sessions WHERE app_user_id = $1) AS sessions`,
        [account.appUserId],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it('records one audit event per issued link, naming only the event and its time (AC-9)', async () => {
      const account = await newAccount();
      await forgot(account.email).expect(202);

      const events = await ctx.sql.query<{
        after: Record<string, unknown>;
        actor_kind: string;
        actor_app_user_id: string | null;
      }>(
        `SELECT after, actor_kind, actor_app_user_id FROM audit_events
          WHERE action = 'APP_USER.PASSWORD_RESET_REQUESTED' AND resource_id = $1`,
        [account.appUserId],
      );

      expect(events.rows).toHaveLength(1);
      // Anyone can ask for a link for any email, so the requester is not recorded as the account owner.
      expect(events.rows[0]).toMatchObject({ actor_kind: 'SYSTEM', actor_app_user_id: null });
      expect(Object.keys(events.rows[0].after).sort()).toEqual(['at', 'event']);
      expect(JSON.stringify(events.rows[0])).not.toContain(account.email);
    });
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
      bodyOf(await login(seed.superAdmin.email, SEED_PASSWORD).expect(200)).data.accessToken;

    const stateOf = async (appUserId: string) =>
      (
        await ctx.sql.query(
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
      const sessions = await ctx.sql.query<{ revoked_reason: string | null }>(
        'SELECT revoked_reason FROM auth_sessions WHERE app_user_id = $1',
        [account.appUserId],
      );
      expect(sessions.rows).toEqual([{ revoked_reason: 'PASSWORD_RESET' }]);
      // Only the new password works.
      await login(account.email, SEED_PASSWORD).expect(401);
      await login(account.email, NEW_PASSWORD).expect(200);
    });

    it('spends no Argon2 on a link that cannot work: unknown, spent, expired, or of another purpose (R-09)', async () => {
      const hasher = ctx.app.get(PasswordHasher, { strict: false });
      const hash = jest.spyOn(hasher, 'hash');
      const account = await newAccount();
      const spent = await issueLink(account);
      await reset(spent).expect(200);
      const expiring = await newAccount();
      const expired = await issueLink(expiring);
      await ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 second' WHERE app_user_id = $1 AND purpose = 'RESET_PASSWORD'`,
        [expiring.appUserId],
      );
      const other = await newAccount();
      await ctx.sql.query(
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
      await ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 second'
          WHERE purpose = 'RESET_PASSWORD' AND app_user_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL`,
        [expiring.appUserId],
      );
      const invitation = await newAccount();
      await ctx.sql.query(
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
      const stillUsable = await ctx.sql.query(
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
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [account.employeeId]);
      const before = await ctx.sql.query('SELECT hash FROM password_credentials WHERE app_user_id = $1', [
        account.appUserId,
      ]);

      expect(bodyOf(await reset(link).expect(400)).error.code).toBe('AUTH.PASSWORD_RESET_INVALID');

      const after = await ctx.sql.query('SELECT hash FROM password_credentials WHERE app_user_id = $1', [
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

      const notices = await ctx.sql.query<{
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
      const payload = cipher.decrypt(
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
      const eventsBefore = await ctx.sql.query('SELECT count(*)::int AS n FROM audit_events WHERE resource_id = $1', [
        account.appUserId,
      ]);
      await reset('A'.repeat(43)).expect(400);
      await reset(link, 'short').expect(422);
      const afterFailures = await ctx.sql.query('SELECT count(*)::int AS n FROM audit_events WHERE resource_id = $1', [
        account.appUserId,
      ]);
      expect(afterFailures.rows).toEqual(eventsBefore.rows);
      const noticesBefore = await ctx.sql.query(
        `SELECT count(*)::int AS n FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' AND recipient = $1`,
        [account.email],
      );
      expect(noticesBefore.rows[0]).toEqual({ n: 0 });

      await reset(link).expect(200);

      const events = await ctx.sql.query<{
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
        (await ctx.sql.query('SELECT * FROM audit_events WHERE resource_id = $1', [account.appUserId])).rows,
      );
      for (const secret of [link, hashOf(link), NEW_PASSWORD, SEED_PASSWORD]) expect(everything).not.toContain(secret);
    });
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
        await ctx.sql.query<{ hash: string }>('SELECT hash FROM password_credentials WHERE app_user_id = $1', [
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
      const reasons = await ctx.sql.query<{ revoked_reason: string | null }>(
        'SELECT revoked_reason FROM auth_sessions WHERE app_user_id = $1',
        [account.appUserId],
      );
      expect(reasons.rows).toEqual([{ revoked_reason: 'PASSWORD_CHANGED' }, { revoked_reason: 'PASSWORD_CHANGED' }]);
      await login(account.email, SEED_PASSWORD).expect(401);
      await login(account.email, NEW_PASSWORD).expect(200);
    });

    it('works for an account with no role at all, and for the Super Admin changing their own (AC-5, FR-8.8)', async () => {
      const account = await newAccount();
      const roles = await ctx.sql.query('SELECT 1 FROM role_grants WHERE app_user_id = $1', [account.appUserId]);
      expect(roles.rows).toEqual([]);
      await change((await signIn(account.email)).accessToken, SEED_PASSWORD).expect(200);

      await change((await signIn(seed.superAdmin.email)).accessToken, SEED_PASSWORD).expect(200);
      // Put the shared administrator back, so the other tests can sign in with the seed password.
      await change((await signIn(seed.superAdmin.email, NEW_PASSWORD)).accessToken, NEW_PASSWORD, SEED_PASSWORD).expect(
        200,
      );
    });

    it('refuses a wrong current password with 422, not 401, and leaves the session and the password alone', async () => {
      const account = await newAccount();
      const session = await signIn(account.email);
      const before = await credentialOf(account.appUserId);

      const answer = await change(session.accessToken, 'not the current password').expect(422);

      expect(bodyOf(answer).error.code).toBe('AUTH.CURRENT_PASSWORD_INVALID');
      expect(await credentialOf(account.appUserId)).toEqual(before);
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${session.accessToken}`).expect(200);
      const events = await ctx.sql.query(
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
      const status = await ctx.sql.query('SELECT status FROM app_users WHERE id = $1', [account.appUserId]);
      expect(status.rows).toEqual([{ status: 'ACTIVE' }]);
    });

    it('clears the failure count once the password is changed, so the owner is not left blocked (T-3)', async () => {
      const account = await newAccount();
      const session = await signIn(account.email);
      await change(session.accessToken, 'wrong guess').expect(422);
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM login_throttles')).rows).toEqual([{ n: 1 }]);

      await change(session.accessToken, SEED_PASSWORD).expect(200);

      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM login_throttles')).rows).toEqual([{ n: 0 }]);
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
      const admin = await signIn(seed.superAdmin.email);
      await request(server())
        .post(`/api/v1/app-users/${locked.appUserId}/lock`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'A locked account must not change its password' })
        .expect(200);
      // Fixture only: the offboarding flow that terminates an employee belongs to G6.
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);

      for (const session of [lockedSession, leftSession]) {
        const answer = await change(session.accessToken, SEED_PASSWORD).expect(401);
        expect(bodyOf(answer).error.code).toBe('INVALID_ACCESS_TOKEN');
      }
    });

    it('queues one notice to the stored email with no link, and keeps secrets out of the audit trail (AC-9, AC-12)', async () => {
      const account = await newAccount('Change.Target@acme.vn');
      const session = await signIn(account.email);
      await change(session.accessToken, 'wrong guess').expect(422);
      const noticesBefore = await ctx.sql.query(
        `SELECT 1 FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' AND recipient = $1`,
        [account.email],
      );
      expect(noticesBefore.rows).toEqual([]);

      await change(session.accessToken, SEED_PASSWORD).expect(200);

      const notices = await ctx.sql.query<{
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
      const payload = cipher.decrypt(
        notices.rows[0].id,
        notices.rows[0].payload_key_id,
        notices.rows[0].payload_ciphertext,
      );
      expect(payload.event).toBe('PASSWORD_CHANGED');
      expect(Object.keys(payload).sort()).toEqual(['at', 'event', 'fullName']);

      const events = await ctx.sql.query<{
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
        (await ctx.sql.query('SELECT * FROM audit_events WHERE resource_id = $1', [account.appUserId])).rows,
      );
      for (const secret of [NEW_PASSWORD, SEED_PASSWORD, 'wrong guess', session.accessToken])
        expect(everything).not.toContain(secret);
    });
  });
});
