import request from 'supertest';
import { PAYLOAD_CIPHER } from '../../src/modules/notifications/notifications.tokens';
import { PayloadCipher } from '../../src/modules/notifications/payload-cipher';
import { bodyOf } from '../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../support/http-test-app';
import { RoleProbeController } from '../support/role-probe.controller';

const NEW_PASSWORD = 'a long enough passphrase';

interface AccountView {
  id: string;
  loginEmail: string;
  status: string;
  activationState: string;
  roles: string[];
  roleHistory?: { role: string; revokedAt: string | null }[];
  invitation?: { usable: boolean; delivery: { status: string } | null } | null;
}

function dataOf<T = AccountView>(response: request.Response): T {
  return (response.body as { data: T }).data;
}

function errorCode(response: request.Response): string {
  return bodyOf(response).error.code;
}

describe('account management over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let adminToken: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();

  const signIn = async (email: string, password: string) => {
    const response = await request(server()).post('/api/v1/auth/login').send({ email, password }).expect(200);
    return { token: bodyOf(response).data.accessToken, response };
  };
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const admin = {
    post: (path: string, body?: object) => request(server()).post(path).set(as(adminToken)).send(body),
    get: (path: string) => request(server()).get(path).set(as(adminToken)),
    delete: (path: string) => request(server()).delete(path).set(as(adminToken)),
  };

  /** The raw token behind an account's current invitation, read the way the dispatcher would. */
  const invitationToken = async (appUserId: string): Promise<string> => {
    const cipher = ctx.app.get<PayloadCipher>(PAYLOAD_CIPHER, { strict: false });
    const { rows } = await ctx.sql.query<{ id: string; payload_key_id: string; payload_ciphertext: Buffer }>(
      `SELECT o.id, o.payload_key_id, o.payload_ciphertext FROM email_outbox o
         JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
        WHERE t.app_user_id = $1 AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND o.payload_ciphertext IS NOT NULL
        ORDER BY o.created_at DESC LIMIT 1`,
      [appUserId],
    );
    return cipher.decrypt(rows[0].id, rows[0].payload_key_id, rows[0].payload_ciphertext).token as string;
  };

  const newEmployee = async (email: string | null = null) => {
    counter += 1;
    const code = `E-N${counter}`;
    const address = email ?? `user${counter}@acme.vn`;
    const { employeeId } = await insertEmployeeFixture(ctx.app, seed, { code, email: address });
    return { employeeId, email: address, code };
  };

  /** Creates an account through the API and activates it through the invitation, as a user would. */
  const activatedAccount = async (roles: string[] = []) => {
    const employee = await newEmployee();
    const created = await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles }).expect(201);
    const account = dataOf(created);
    const token = await invitationToken(account.id);
    await request(server()).post('/api/v1/auth/invitations/redeem').send({ token, password: NEW_PASSWORD }).expect(200);
    return { ...employee, appUserId: account.id, password: NEW_PASSWORD };
  };

  const countAudit = async (action: string, resourceId?: string) =>
    Number(
      (
        await ctx.sql.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM audit_events WHERE action = $1 AND ($2::text IS NULL OR resource_id = $2)',
          [action, resourceId ?? null],
        )
      ).rows[0].n,
    );

  beforeAll(async () => {
    ctx = await createHttpTestApp({ extraControllers: [RoleProbeController] });
    seed = await seedInstallation(ctx.app);
    adminToken = (await signIn(seed.superAdmin.email, SEED_PASSWORD)).token;
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  afterEach(async () => {
    await ctx.sql.query('DELETE FROM login_throttles');
  });

  describe('candidates and creation (US-01-01 AC-1, AC-5, AC-8, AC-16)', () => {
    it('lists employees without an account, excluding the departed, and finds them by name or code', async () => {
      const candidate = await newEmployee('candidate.one@acme.vn');
      const departed = await insertEmployeeFixture(ctx.app, seed, {
        code: 'E-GONE',
        email: 'gone@acme.vn',
        terminated: true,
      });
      void departed;

      const response = await admin.get('/api/v1/account-candidates?search=candidate.one').expect(200);
      const items = dataOf<{ items: { id: string; employeeCode: string; department: string | null }[] }>(
        response,
      ).items;

      expect(items.map((item) => item.id)).toEqual([candidate.employeeId]);
      expect(items[0].department).toBe('Operations');
      const everyone = dataOf<{ items: { employeeCode: string }[] }>(
        await admin.get('/api/v1/account-candidates').expect(200),
      );
      const codes = everyone.items.map((item) => item.employeeCode);
      expect(codes).not.toContain('E-GONE');
      expect(codes).not.toContain('E-ADMIN');
    });

    it('creates an invited account with its roles, one queued mail and a full audit trail', async () => {
      const employee = await newEmployee();

      const response = await admin
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
      const mails = await ctx.sql.query(
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
      await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: ['IT_ADMIN'] }).expect(201);

      const response = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: employee.email, password: NEW_PASSWORD })
        .expect(401);

      expect(errorCode(response)).toBe('AUTH.INVALID_CREDENTIALS');
    });

    it('creates an account with no roles and does not add EMPLOYEE by itself (AC-16)', async () => {
      const employee = await newEmployee();

      const account = dataOf(
        await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
      );

      expect(account.roles).toEqual([]);
    });

    it('accepts a separate login email, which must be unique (AC-8)', async () => {
      const first = await newEmployee();
      const second = await newEmployee();
      await admin
        .post('/api/v1/app-users', { employeeId: first.employeeId, loginEmail: 'Shared.Login@acme.vn', roles: [] })
        .expect(201);

      const clash = await admin
        .post('/api/v1/app-users', { employeeId: second.employeeId, loginEmail: 'shared.login@ACME.vn', roles: [] })
        .expect(409);

      expect(errorCode(clash)).toBe('APP_USER.LOGIN_EMAIL_TAKEN');
    });

    it('refuses an employee who has left, one who already has an account, and an unknown one', async () => {
      const gone = await insertEmployeeFixture(ctx.app, seed, {
        code: 'E-LEFT',
        email: 'left@acme.vn',
        terminated: true,
      });
      const employee = await newEmployee();
      await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201);

      expect(
        errorCode(await admin.post('/api/v1/app-users', { employeeId: gone.employeeId, roles: [] }).expect(409)),
      ).toBe('APP_USER.EMPLOYEE_TERMINATED');
      expect(
        errorCode(await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(409)),
      ).toBe('APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE');
      expect(
        errorCode(
          await admin
            .post('/api/v1/app-users', { employeeId: '9b8c6f5e-0000-4000-8000-000000000000', roles: [] })
            .expect(404),
        ),
      ).toBe('ORGANIZATION.EMPLOYEE_NOT_FOUND');
    });

    it('lets exactly one of two simultaneous creations for the same employee through', async () => {
      const employee = await newEmployee();

      const results = await Promise.all([
        admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }),
        admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('refuses derived and transfer-only roles at creation without creating anything (AC-4, AC-14)', async () => {
      const employee = await newEmployee();
      const before = await ctx.sql.query('SELECT count(*)::int AS n FROM app_users');

      const derived = await admin
        .post('/api/v1/app-users', { employeeId: employee.employeeId, roles: ['MANAGER'] })
        .expect(422);
      const transfer = await admin
        .post('/api/v1/app-users', { employeeId: employee.employeeId, roles: ['SUPER_ADMIN', 'IT_ADMIN'] })
        .expect(422);

      expect(errorCode(derived)).toBe('APP_USER.ROLE_DERIVED');
      expect(errorCode(transfer)).toBe('APP_USER.SUPER_ADMIN_TRANSFER_ONLY');
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM app_users')).rows).toEqual(before.rows);
    });
  });

  describe('invitation and activation (US-01-10 AC-1, AC-2, AC-8, AC-9)', () => {
    it('activates with a valid password and then signs in with the granted role in force', async () => {
      const user = await activatedAccount(['IT_ADMIN']);

      const { token } = await signIn(user.email, user.password);

      const me = await request(server()).get('/api/v1/me').set(as(token)).expect(200);
      expect(dataOf<{ roles: { effective: string[] } }>(me).roles.effective).toEqual(['IT_ADMIN']);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
      const row = await ctx.sql.query(
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
        await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
      );
      const first = await invitationToken(account.id);
      await admin.post(`/api/v1/app-users/${account.id}/invitations`).expect(202);
      const second = await invitationToken(account.id);
      const redeem = (token: string) =>
        request(server()).post('/api/v1/auth/invitations/redeem').send({ token, password: NEW_PASSWORD });

      const replaced = await redeem(first).expect(400);
      const unknown = await redeem('x'.repeat(43)).expect(400);
      await ctx.sql.query(
        "UPDATE account_action_tokens SET expires_at = now() - interval '1 minute' WHERE consumed_at IS NULL AND revoked_at IS NULL AND app_user_id = $1",
        [account.id],
      );
      const expired = await redeem(second).expect(400);

      for (const response of [replaced, unknown, expired]) expect(errorCode(response)).toBe('AUTH.INVITATION_INVALID');
      expect(bodyOf(replaced).error.message).toBe(bodyOf(unknown).error.message);
      expect(bodyOf(expired).error.message).toBe(bodyOf(unknown).error.message);
      const state = await ctx.sql.query<{ activation_state: string }>(
        'SELECT activation_state FROM app_users WHERE id = $1',
        [account.id],
      );
      expect(state.rows[0].activation_state).toBe('INVITED');
      expect(await countAudit('APP_USER.ACTIVATED', account.id)).toBe(0);
    });

    it('lets a used token work once only', async () => {
      const employee = await newEmployee();
      const account = dataOf(
        await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
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
        await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
      );
      await ctx.sql.query(
        "UPDATE account_action_tokens SET expires_at = now() - interval '1 hour' WHERE app_user_id = $1",
        [account.id],
      );

      const resent = await admin.post(`/api/v1/app-users/${account.id}/invitations`).expect(202);

      expect(bodyOf(resent).message).toBe('APP_USER.INVITATION_SENT');
      const usable = await ctx.sql.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM account_action_tokens WHERE app_user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL',
        [account.id],
      );
      expect(usable.rows[0].n).toBe(1);
      const cancelled = await ctx.sql.query(
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
        await admin.post('/api/v1/app-users', { employeeId: locked.employeeId, roles: [] }).expect(201),
      );
      await admin.post(`/api/v1/app-users/${lockedAccount.id}/lock`).expect(200);

      expect(errorCode(await admin.post(`/api/v1/app-users/${user.appUserId}/invitations`).expect(409))).toBe(
        'APP_USER.ALREADY_ACTIVATED',
      );
      expect(errorCode(await admin.post(`/api/v1/app-users/${lockedAccount.id}/invitations`).expect(409))).toBe(
        'APP_USER.ACCOUNT_LOCKED',
      );
      expect(
        errorCode(await admin.post(`/api/v1/app-users/${seed.superAdmin.appUserId}/invitations`).expect(409)),
      ).toBe('APP_USER.SELF_CHANGE_FORBIDDEN');
    });

    it('keeps passwords, tokens and hashes out of the audit trail and the outbox columns (AC-8, AC-9)', async () => {
      const user = await activatedAccount(['EMPLOYEE']);
      const audit = JSON.stringify((await ctx.sql.query('SELECT before, after FROM audit_events')).rows);
      const outbox = JSON.stringify(
        (
          await ctx.sql.query(
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

  describe('lock and unlock (US-01-01 AC-6, AC-7, AC-13, AC-15)', () => {
    it('ends the account at its next request even though the access token is still valid', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      const { token, response } = await signIn(user.email, user.password);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
      const cookie = (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

      const locked = await admin.post(`/api/v1/app-users/${user.appUserId}/lock`).expect(200);

      expect(bodyOf(locked).message).toBe('APP_USER.LOCKED');
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(401);
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      const reasons = await ctx.sql.query<{ revoked_reason: string }>(
        'SELECT revoked_reason FROM auth_sessions WHERE app_user_id = $1',
        [user.appUserId],
      );
      expect(reasons.rows.every((r) => r.revoked_reason === 'ACCOUNT_LOCKED')).toBe(true);
      expect(await countAudit('APP_USER.LOCKED', user.appUserId)).toBe(1);
    });

    it('is idempotent: a second lock changes nothing and writes no second audit event', async () => {
      const user = await activatedAccount();
      await admin.post(`/api/v1/app-users/${user.appUserId}/lock`).expect(200);

      await admin.post(`/api/v1/app-users/${user.appUserId}/lock`).expect(200);

      expect(await countAudit('APP_USER.LOCKED', user.appUserId)).toBe(1);
    });

    it('unlocking restores sign-in and the roles held, without bringing an old invitation back', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      await admin.post(`/api/v1/app-users/${user.appUserId}/lock`).expect(200);
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);

      const unlocked = await admin.post(`/api/v1/app-users/${user.appUserId}/unlock`).expect(200);

      expect(bodyOf(unlocked).message).toBe('APP_USER.UNLOCKED');
      const { token } = await signIn(user.email, user.password);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
      expect(await countAudit('APP_USER.UNLOCKED', user.appUserId)).toBe(1);
    });

    it('locking revokes an unused invitation and cancels its mail', async () => {
      const employee = await newEmployee();
      const account = dataOf(
        await admin.post('/api/v1/app-users', { employeeId: employee.employeeId, roles: [] }).expect(201),
      );
      const token = await invitationToken(account.id);

      await admin.post(`/api/v1/app-users/${account.id}/lock`).expect(200);
      await admin.post(`/api/v1/app-users/${account.id}/unlock`).expect(200);

      const redeem = await request(server())
        .post('/api/v1/auth/invitations/redeem')
        .send({ token, password: NEW_PASSWORD })
        .expect(400);
      expect(errorCode(redeem)).toBe('AUTH.INVITATION_INVALID');
      const mail = await ctx.sql.query(
        'SELECT o.status FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash WHERE t.app_user_id = $1',
        [account.id],
      );
      expect(mail.rows).toEqual([{ status: 'CANCELLED' }]);
    });

    it('refuses to let the Super Admin lock, unlock or re-grant their own account (AC-13, AC-15)', async () => {
      const self = seed.superAdmin.appUserId;

      for (const path of ['lock', 'unlock']) {
        const response = await admin.post(`/api/v1/app-users/${self}/${path}`).expect(409);
        expect(errorCode(response)).toBe('APP_USER.SELF_CHANGE_FORBIDDEN');
      }
      expect(
        errorCode(await admin.post(`/api/v1/app-users/${self}/role-grants`, { role: 'EMPLOYEE' }).expect(409)),
      ).toBe('APP_USER.SELF_CHANGE_FORBIDDEN');
      expect(errorCode(await admin.delete(`/api/v1/app-users/${self}/role-grants/SUPER_ADMIN`).expect(409))).toBe(
        'APP_USER.SELF_CHANGE_FORBIDDEN',
      );
    });
  });

  describe('role grants (US-01-01 AC-2, AC-4, AC-7, AC-12, AC-14, AC-16, AC-17, AC-18)', () => {
    it('adds EMPLOYEE, then revoking IT_ADMIN stops IT routes at the next request while EMPLOYEE keeps working', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      const { token } = await signIn(user.email, user.password);
      await admin.post(`/api/v1/app-users/${user.appUserId}/role-grants`, { role: 'EMPLOYEE' }).expect(201);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
      await request(server()).get('/api/v1/probe/employee').set(as(token)).expect(200);

      const revoked = await admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/IT_ADMIN`).expect(200);

      expect(bodyOf(revoked).message).toBe('ROLE.REVOKED');
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(403);
      await request(server()).get('/api/v1/probe/employee').set(as(token)).expect(200);
    });

    it('allows revoking the last role: the account then only reaches self-service routes', async () => {
      const user = await activatedAccount(['EMPLOYEE']);
      const { token } = await signIn(user.email, user.password);

      await admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/EMPLOYEE`).expect(200);

      await request(server()).get('/api/v1/probe/employee').set(as(token)).expect(403);
      const me = await request(server()).get('/api/v1/me').set(as(token)).expect(200);
      expect(dataOf<{ selfServiceOnly: boolean }>(me).selfServiceOnly).toBe(true);
    });

    it('keeps the history of grants and revocations on the account detail', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      await admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/IT_ADMIN`).expect(200);
      await admin.post(`/api/v1/app-users/${user.appUserId}/role-grants`, { role: 'IT_ADMIN' }).expect(201);

      const detail = dataOf(await admin.get(`/api/v1/app-users/${user.appUserId}`).expect(200));

      expect(detail.roles).toEqual(['IT_ADMIN']);
      expect(detail.roleHistory?.filter((entry) => entry.role === 'IT_ADMIN')).toHaveLength(2);
      expect(detail.roleHistory?.filter((entry) => entry.revokedAt !== null)).toHaveLength(1);
    });

    it('refuses derived, transfer-only, repeated, missing and forbidden-combination roles with their own codes', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      const grant = (role: string) => admin.post(`/api/v1/app-users/${user.appUserId}/role-grants`, { role });

      expect(errorCode(await grant('MANAGER').expect(422))).toBe('APP_USER.ROLE_DERIVED');
      expect(errorCode(await grant('SUPER_ADMIN').expect(422))).toBe('APP_USER.SUPER_ADMIN_TRANSFER_ONLY');
      expect(errorCode(await grant('IT_ADMIN').expect(409))).toBe('APP_USER.ROLE_ALREADY_GRANTED');
      expect(errorCode(await admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/FINANCE`).expect(404))).toBe(
        'APP_USER.ROLE_NOT_GRANTED',
      );
      expect(
        errorCode(await admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/SUPER_ADMIN`).expect(422)),
      ).toBe('APP_USER.SUPER_ADMIN_TRANSFER_ONLY');
    });

    it('allows only one Finance: a holder who is still invited or locked keeps the place; revoking frees it (AC-18)', async () => {
      const first = await newEmployee();
      const second = await newEmployee();
      const invited = dataOf(
        await admin.post('/api/v1/app-users', { employeeId: first.employeeId, roles: ['FINANCE'] }).expect(201),
      );
      const other = dataOf(
        await admin.post('/api/v1/app-users', { employeeId: second.employeeId, roles: [] }).expect(201),
      );

      const whileInvited = await admin
        .post(`/api/v1/app-users/${other.id}/role-grants`, { role: 'FINANCE' })
        .expect(409);
      await admin.post(`/api/v1/app-users/${invited.id}/lock`).expect(200);
      const whileLocked = await admin
        .post(`/api/v1/app-users/${other.id}/role-grants`, { role: 'FINANCE' })
        .expect(409);
      await admin.delete(`/api/v1/app-users/${invited.id}/role-grants/FINANCE`).expect(200);
      const afterRevoke = await admin
        .post(`/api/v1/app-users/${other.id}/role-grants`, { role: 'FINANCE' })
        .expect(201);

      expect(errorCode(whileInvited)).toBe('APP_USER.FINANCE_ALREADY_ASSIGNED');
      expect(errorCode(whileLocked)).toBe('APP_USER.FINANCE_ALREADY_ASSIGNED');
      expect(bodyOf(afterRevoke).message).toBe('ROLE.GRANTED');
      await admin.delete(`/api/v1/app-users/${other.id}/role-grants/FINANCE`).expect(200);
    });

    it('lets exactly one of two simultaneous Finance grants through', async () => {
      const first = dataOf(
        await admin.post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: [] }).expect(201),
      );
      const second = dataOf(
        await admin.post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: [] }).expect(201),
      );

      const results = await Promise.all([
        admin.post(`/api/v1/app-users/${first.id}/role-grants`, { role: 'FINANCE' }),
        admin.post(`/api/v1/app-users/${second.id}/role-grants`, { role: 'FINANCE' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const held = await ctx.sql.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM role_grants WHERE role = 'FINANCE' AND revoked_at IS NULL",
      );
      expect(held.rows[0].n).toBe(1);
      await ctx.sql.query("UPDATE role_grants SET revoked_at = now() WHERE role = 'FINANCE' AND revoked_at IS NULL");
    });
  });

  describe('access to the management routes (US-01-01 AC-3)', () => {
    it('answers 403 to an IT Admin and changes nothing', async () => {
      const itAdmin = await activatedAccount(['IT_ADMIN']);
      const { token } = await signIn(itAdmin.email, itAdmin.password);
      const employee = await newEmployee();
      const before = await ctx.sql.query('SELECT count(*)::int AS n FROM app_users');

      const created = await request(server())
        .post('/api/v1/app-users')
        .set(as(token))
        .send({ employeeId: employee.employeeId, roles: [] })
        .expect(403);
      await request(server()).get('/api/v1/app-users').set(as(token)).expect(403);
      await request(server()).get('/api/v1/account-candidates').set(as(token)).expect(403);
      await request(server()).post(`/api/v1/app-users/${itAdmin.appUserId}/lock`).set(as(token)).expect(403);

      expect(errorCode(created)).toBe('AUTHORIZATION.FORBIDDEN');
      expect((await ctx.sql.query('SELECT count(*)::int AS n FROM app_users')).rows).toEqual(before.rows);
    });

    it('requires a sign-in', async () => {
      await request(server()).get('/api/v1/app-users').expect(401);
    });
  });

  describe('listing', () => {
    it('filters accounts by activation state and role, with paging', async () => {
      const invited = dataOf(
        await admin
          .post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: ['EMPLOYEE'] })
          .expect(201),
      );

      const page = dataOf<{ items: AccountView[]; pagination: { totalItems: number } }>(
        await admin.get('/api/v1/app-users?activationState=INVITED&role=EMPLOYEE&pageSize=100').expect(200),
      );

      expect(page.items.map((item) => item.id)).toContain(invited.id);
      expect(page.items.every((item) => item.activationState === 'INVITED' && item.roles.includes('EMPLOYEE'))).toBe(
        true,
      );
      expect(page.pagination.totalItems).toBe(page.items.length);
    });

    it('shows the invitation delivery state on the detail', async () => {
      const account = dataOf(
        await admin.post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: [] }).expect(201),
      );

      const detail = dataOf(await admin.get(`/api/v1/app-users/${account.id}`).expect(200));

      expect(detail.invitation).toMatchObject({ usable: true, delivery: { status: 'PENDING' } });
      await admin.get('/api/v1/app-users/9b8c6f5e-0000-4000-8000-000000000000').expect(404);
    });
  });
});
