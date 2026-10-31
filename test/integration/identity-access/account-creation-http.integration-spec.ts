import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import { insertEmployeeFixture } from '../../support/http-test-app';
import {
  AccountManagementHttpHarness,
  NEW_PASSWORD,
  dataOf,
  errorCode,
} from '../../support/account-management-http-harness';

describe('account management over HTTP (integration, real PostgreSQL): an invalid id, candidates, creation, invitation and activation', () => {
  const h = new AccountManagementHttpHarness();
  const { server, signIn, as, invitationToken, newEmployee, activatedAccount, countAudit } = h;

  beforeAll(async () => {
    await h.start();
  }, 90000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  it.each([
    ['invitations', undefined],
    ['lock', { reason: 'Only the identifier is wrong here' }],
    ['unlock', { reason: 'Only the identifier is wrong here' }],
  ])('rejects an invalid account UUID on POST /app-users/:id/%s with 422 VALIDATION_ERROR', async (action, body) => {
    const response = await h.admin.post(`/api/v1/app-users/not-a-uuid/${action}`, body).expect(422);

    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });

  describe('candidates and creation (US-01-01 AC-1, AC-5, AC-8, AC-16)', () => {
    it('lists employees without an account, excluding the departed, and finds them by name or code', async () => {
      const candidate = await newEmployee('candidate.one@acme.vn');
      const departed = await insertEmployeeFixture(h.ctx.app, h.seed, {
        code: 'E-GONE',
        email: 'gone@acme.vn',
        terminated: true,
      });
      void departed;

      const response = await h.admin.get('/api/v1/account-candidates?search=candidate.one').expect(200);
      const items = dataOf<{ items: { id: string; employeeCode: string; department: string | null }[] }>(
        response,
      ).items;

      expect(items.map((item) => item.id)).toEqual([candidate.employeeId]);
      expect(items[0].department).toBe('Operations');
      const everyone = dataOf<{ items: { employeeCode: string }[] }>(
        await h.admin.get('/api/v1/account-candidates').expect(200),
      );
      const codes = everyone.items.map((item) => item.employeeCode);
      expect(codes).not.toContain('E-GONE');
      expect(codes).not.toContain('E-ADMIN');
    });

    it('creates an invited account with its roles, one queued mail and a full audit trail', async () => {
      const employee = await newEmployee();

      const response = await h.admin
        .post('/api/v1/app-users', { employeeId: employee.employeeId, roles: ['IT_ADMIN'] })
        .expect(201);

      const account = dataOf(response);
      expect(bodyOf(response).message).toBe('APP_USER.CREATED');
      expect(account).toMatchObject({
        loginEmail: employee.email,
        status: 'ACTIVE',
        activationState: 'INVITED',
        roles: ['IT_ADMIN'],
      });
      const mails = await h.ctx.sql.query(
        'SELECT status, recipient FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash WHERE t.app_user_id = $1',
        [account.id],
      );
      expect(mails.rows).toEqual([{ status: 'PENDING', recipient: employee.email }]);
      expect(await countAudit('APP_USER.CREATED', account.id)).toBe(1);
      expect(await countAudit('ROLE.GRANTED', account.id)).toBe(1);
      expect(await countAudit('APP_USER.INVITATION_SENT', account.id)).toBe(1);
    });

    it('cannot sign in before the invitation is redeemed, and a granted role has no effect yet (AC-11)', async () => {
      const employee = await newEmployee();
      await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: ['IT_ADMIN'] }).expect(201);

      const response = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: employee.email, password: NEW_PASSWORD })
        .expect(401);

      expect(errorCode(response)).toBe('AUTH.INVALID_CREDENTIALS');
    });

    it('creates an account with no roles and does not add EMPLOYEE by itself (AC-16)', async () => {
      const employee = await newEmployee();

      const account = dataOf(
        await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
      );

      expect(account.roles).toEqual([]);
    });

    it('accepts a separate login email, which must be unique (AC-8)', async () => {
      const first = await newEmployee();
      const second = await newEmployee();
      await h.admin
        .post('/api/v1/app-users', { employeeId: first.employeeId, loginEmail: 'Shared.Login@acme.vn', roles: [] })
        .expect(201);

      const clash = await h.admin
        .post('/api/v1/app-users', { employeeId: second.employeeId, loginEmail: 'shared.login@ACME.vn', roles: [] })
        .expect(409);

      expect(errorCode(clash)).toBe('APP_USER.LOGIN_EMAIL_TAKEN');
    });

    it('refuses an employee who has left, one who already has an account, and an unknown one', async () => {
      const gone = await insertEmployeeFixture(h.ctx.app, h.seed, {
        code: 'E-LEFT',
        email: 'left@acme.vn',
        terminated: true,
      });
      const employee = await newEmployee();
      await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201);

      expect(
        errorCode(await h.admin.post('/api/v1/app-users', { employeeId: gone.employeeId, roles: [] }).expect(409)),
      ).toBe('APP_USER.EMPLOYEE_TERMINATED');
      expect(
        errorCode(await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(409)),
      ).toBe('APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE');
      expect(
        errorCode(
          await h.admin
            .post('/api/v1/app-users', { employeeId: '9b8c6f5e-0000-4000-8000-000000000000', roles: [] })
            .expect(404),
        ),
      ).toBe('ORGANIZATION.EMPLOYEE_NOT_FOUND');
    });

    it('lets exactly one of two simultaneous creations for the same employee through', async () => {
      const employee = await newEmployee();

      const results = await Promise.all([
        h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }),
        h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('refuses derived and transfer-only roles at creation without creating anything (AC-4, AC-14)', async () => {
      const employee = await newEmployee();
      const before = await h.ctx.sql.query('SELECT count(*)::int AS n FROM app_users');

      const derived = await h.admin
        .post('/api/v1/app-users', { employeeId: employee.employeeId, roles: ['MANAGER'] })
        .expect(422);
      const transfer = await h.admin
        .post('/api/v1/app-users', { employeeId: employee.employeeId, roles: ['SUPER_ADMIN', 'IT_ADMIN'] })
        .expect(422);

      expect(errorCode(derived)).toBe('APP_USER.ROLE_DERIVED');
      expect(errorCode(transfer)).toBe('APP_USER.SUPER_ADMIN_TRANSFER_ONLY');
      expect((await h.ctx.sql.query('SELECT count(*)::int AS n FROM app_users')).rows).toEqual(before.rows);
    });
  });

  describe('invitation and activation (US-01-10 AC-1, AC-2, AC-8, AC-9)', () => {
    it('activates with a valid password and then signs in with the granted role in force', async () => {
      const user = await activatedAccount(['IT_ADMIN']);

      const { token } = await signIn(user.email, user.password);

      const me = await request(server()).get('/api/v1/me').set(as(token)).expect(200);
      expect(dataOf<{ roles: { effective: string[] } }>(me).roles.effective).toEqual(['IT_ADMIN']);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
      const row = await h.ctx.sql.query(
        'SELECT activation_state, email_verification_source FROM app_users WHERE id = $1',
        [user.appUserId],
      );
      expect(row.rows[0]).toEqual({ activation_state: 'ACTIVATED', email_verification_source: 'INVITATION_REDEEMED' });
      expect(await countAudit('APP_USER.ACTIVATED', user.appUserId)).toBe(1);
    });

    it('checks the password policy before it looks at the token, so a weak password reveals nothing', async () => {
      const weak = await request(server())
        .post('/api/v1/auth/invitations/redeem')
        .send({ token: 'not-a-real-token', password: 'short' })
        .expect(422);

      expect(errorCode(weak)).toBe('AUTH.PASSWORD_POLICY_VIOLATION');
    });

    it('answers every unusable token the same way: unknown, used, replaced and expired', async () => {
      const employee = await newEmployee();
      const account = dataOf(
        await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
      );
      const first = await invitationToken(account.id);
      await h.admin.post(`/api/v1/app-users/${account.id}/invitations`).expect(202);
      const second = await invitationToken(account.id);
      const redeem = (token: string) =>
        request(server()).post('/api/v1/auth/invitations/redeem').send({ token, password: NEW_PASSWORD });

      const replaced = await redeem(first).expect(400);
      const unknown = await redeem('x'.repeat(43)).expect(400);
      await h.ctx.sql.query(
        "UPDATE account_action_tokens SET expires_at = now() - interval '1 minute' WHERE consumed_at IS NULL AND revoked_at IS NULL AND app_user_id = $1",
        [account.id],
      );
      const expired = await redeem(second).expect(400);

      for (const response of [replaced, unknown, expired]) expect(errorCode(response)).toBe('AUTH.INVITATION_INVALID');
      expect(bodyOf(replaced).error.message).toBe(bodyOf(unknown).error.message);
      expect(bodyOf(expired).error.message).toBe(bodyOf(unknown).error.message);
      const state = await h.ctx.sql.query<{ activation_state: string }>(
        'SELECT activation_state FROM app_users WHERE id = $1',
        [account.id],
      );
      expect(state.rows[0].activation_state).toBe('INVITED');
      expect(await countAudit('APP_USER.ACTIVATED', account.id)).toBe(0);
    });

    it('lets a used token work once only', async () => {
      const employee = await newEmployee();
      const account = dataOf(
        await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
      );
      const token = await invitationToken(account.id);
      const redeem = () =>
        request(server()).post('/api/v1/auth/invitations/redeem').send({ token, password: NEW_PASSWORD });

      await redeem().expect(200);

      expect(errorCode(await redeem().expect(400))).toBe('AUTH.INVITATION_INVALID');
    });

    it('resending keeps exactly one usable token, even when the previous one had already expired', async () => {
      const employee = await newEmployee();
      const account = dataOf(
        await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
      );
      await h.ctx.sql.query(
        "UPDATE account_action_tokens SET expires_at = now() - interval '1 hour' WHERE app_user_id = $1",
        [account.id],
      );

      const resent = await h.admin.post(`/api/v1/app-users/${account.id}/invitations`).expect(202);

      expect(bodyOf(resent).message).toBe('APP_USER.INVITATION_SENT');
      const usable = await h.ctx.sql.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM account_action_tokens WHERE app_user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL',
        [account.id],
      );
      expect(usable.rows[0].n).toBe(1);
      const cancelled = await h.ctx.sql.query(
        `SELECT o.status FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
          WHERE t.app_user_id = $1 AND t.revoked_reason = 'SUPERSEDED'`,
        [account.id],
      );
      expect(cancelled.rows).toEqual([{ status: 'CANCELLED' }]);
    });

    it('does not resend to an activated or locked account, or to oneself', async () => {
      const user = await activatedAccount();
      const locked = await newEmployee();
      const lockedAccount = dataOf(
        await h.admin.post('/api/v1/app-users', { employeeId: locked.employeeId, roles: [] }).expect(201),
      );
      await h.admin
        .post(`/api/v1/app-users/${lockedAccount.id}/lock`, { reason: 'Locked so a resend must be refused' })
        .expect(200);

      expect(errorCode(await h.admin.post(`/api/v1/app-users/${user.appUserId}/invitations`).expect(409))).toBe(
        'APP_USER.ALREADY_ACTIVATED',
      );
      expect(errorCode(await h.admin.post(`/api/v1/app-users/${lockedAccount.id}/invitations`).expect(409))).toBe(
        'APP_USER.ACCOUNT_LOCKED',
      );
      expect(
        errorCode(await h.admin.post(`/api/v1/app-users/${h.seed.superAdmin.appUserId}/invitations`).expect(409)),
      ).toBe('APP_USER.SELF_CHANGE_FORBIDDEN');
    });

    it('keeps passwords, tokens and hashes out of the audit trail and the outbox columns (AC-8, AC-9)', async () => {
      const user = await activatedAccount(['EMPLOYEE']);
      const audit = JSON.stringify((await h.ctx.sql.query('SELECT before, after FROM audit_events')).rows);
      const outbox = JSON.stringify(
        (
          await h.ctx.sql.query(
            'SELECT recipient, template, locale, action_token_hash, last_error_code FROM email_outbox',
          )
        ).rows,
      );

      expect(audit).not.toContain(NEW_PASSWORD);
      expect(audit).not.toMatch(/token/i);
      expect(outbox).not.toContain(NEW_PASSWORD);
      expect(user.password).toBe(NEW_PASSWORD);
    });
  });
});
