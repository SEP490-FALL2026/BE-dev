import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import { insertAccountFixture } from '../../support/http-test-app';
import { PasswordSelfServiceHarness } from '../../support/password-self-service-harness';

describe('password self-service over HTTP (integration, real PostgreSQL): forgot password', () => {
  const h = new PasswordSelfServiceHarness();
  const { server, newAccount, freshAddress, forgot, resetTokensOf, mailFor } = h;

  beforeAll(async () => {
    await h.start();
  }, 90000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('forgot password (US-01-10 AC-3)', () => {
    it('answers every kind of account identically and queues mail only for an active, activated one', async () => {
      const usable = await newAccount('Mixed.Case@acme.vn');
      h.counter += 1;
      const invited = await insertAccountFixture(h.ctx.app, h.seed, {
        code: `E-PS${h.counter}`,
        email: `invited.${h.counter}@acme.vn`,
        activated: false,
      });
      const locked = await newAccount();
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [locked.appUserId]);
      const left = await newAccount();
      // Fixture only: the offboarding flow that terminates an employee belongs to G6.
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);

      const answers = [
        await forgot('  mixed.case@ACME.vn  ').expect(202),
        await forgot('nobody@acme.vn').expect(202),
        await forgot(`invited.${h.counter}@acme.vn`).expect(202),
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
      const mail = await h.ctx.sql.query(
        `SELECT recipient FROM email_outbox WHERE template = 'PASSWORD_RESET' AND recipient = ANY($1::text[])`,
        [[locked.email, left.email, `invited.${h.counter}@acme.vn`, 'nobody@acme.vn']],
      );
      expect(mail.rows).toEqual([]);
    });

    it('opens no transaction for an address that cannot get a link, so it costs what an unknown address costs (AC-3)', async () => {
      const runner = h.ctx.app.get(TransactionRunner);
      const run = jest.spyOn(runner, 'run');
      const locked = await newAccount();
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [locked.appUserId]);
      const left = await newAccount();
      // Fixture only: the offboarding flow that terminates an employee belongs to G6.
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);
      h.counter += 1;
      const invited = await insertAccountFixture(h.ctx.app, h.seed, {
        code: `E-PS${h.counter}`,
        email: `invited.nt.${h.counter}@acme.vn`,
        activated: false,
      });
      const usable = await newAccount();
      // The fixtures above wrote through the runner too; only what the route itself does is counted.
      run.mockClear();
      try {
        for (const email of ['nobody.here@acme.vn', locked.email, left.email, `invited.nt.${h.counter}@acme.vn`]) {
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
      const before = await h.ctx.sql.query(
        `SELECT (SELECT hash FROM password_credentials WHERE app_user_id = $1) AS hash,
                (SELECT status FROM app_users WHERE id = $1) AS status,
                (SELECT count(*) FROM role_grants WHERE app_user_id = $1) AS grants,
                (SELECT count(*) FROM auth_sessions WHERE app_user_id = $1) AS sessions`,
        [account.appUserId],
      );

      await forgot(account.email).expect(202);

      const after = await h.ctx.sql.query(
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

      const events = await h.ctx.sql.query<{
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
});
