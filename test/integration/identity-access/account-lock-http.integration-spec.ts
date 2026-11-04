import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import {
  AccountManagementHttpHarness,
  NEW_PASSWORD,
  dataOf,
  errorCode,
} from '../../support/account-management-http-harness';

describe('account management over HTTP (integration, real PostgreSQL): lock and unlock, and the reason of each', () => {
  const h = new AccountManagementHttpHarness();
  const { server, signIn, as, invitationToken, newEmployee, activatedAccount, countAudit } = h;

  beforeAll(async () => {
    await h.start();
  }, 90000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('lock and unlock (US-01-01 AC-6, AC-7, AC-13, AC-15)', () => {
    it('ends the account at its next request even though the access token is still valid', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      const { token, response } = await signIn(user.email, user.password);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
      const refreshToken = bodyOf(response).data.refreshToken;

      const locked = await h.admin
        .post(`/api/v1/app-users/${user.appUserId}/lock`, { reason: 'Contain the account during an incident review' })
        .expect(200);

      expect(bodyOf(locked).message).toBe('APP_USER.LOCKED');
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(401);
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
      const reasons = await h.ctx.sql.query<{ revoked_reason: string }>(
        'SELECT revoked_reason FROM auth_sessions WHERE app_user_id = $1',
        [user.appUserId],
      );
      expect(reasons.rows.every((r) => r.revoked_reason === 'ACCOUNT_LOCKED')).toBe(true);
      expect(await countAudit('APP_USER.LOCKED', user.appUserId)).toBe(1);
    });

    it('is idempotent: a second lock changes nothing and writes no second audit event', async () => {
      const user = await activatedAccount();
      await h.admin
        .post(`/api/v1/app-users/${user.appUserId}/lock`, { reason: 'First lock of the account' })
        .expect(200);

      await h.admin.post(`/api/v1/app-users/${user.appUserId}/lock`, { reason: 'Repeated lock request' }).expect(200);

      expect(await countAudit('APP_USER.LOCKED', user.appUserId)).toBe(1);
    });

    it('unlocking restores sign-in and the roles held, without bringing an old invitation back', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      await h.admin.post(`/api/v1/app-users/${user.appUserId}/lock`, { reason: 'Contain the account' }).expect(200);
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);

      const unlocked = await h.admin
        .post(`/api/v1/app-users/${user.appUserId}/unlock`, { reason: 'Verified with the department head' })
        .expect(200);

      expect(bodyOf(unlocked).message).toBe('APP_USER.UNLOCKED');
      const { token } = await signIn(user.email, user.password);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
      expect(await countAudit('APP_USER.UNLOCKED', user.appUserId)).toBe(1);
    });

    it('locking revokes an unused invitation and cancels its mail', async () => {
      const employee = await newEmployee();
      const account = dataOf(
        await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId, role: 'EMPLOYEE' }).expect(201),
      );
      const token = await invitationToken(account.id);

      await h.admin.post(`/api/v1/app-users/${account.id}/lock`, { reason: 'Contain the invited account' }).expect(200);
      await h.admin
        .post(`/api/v1/app-users/${account.id}/unlock`, { reason: 'Containment no longer needed' })
        .expect(200);

      const redeem = await request(server())
        .post('/api/v1/auth/invitations/redeem')
        .send({ token, password: NEW_PASSWORD })
        .expect(400);
      expect(errorCode(redeem)).toBe('AUTH.INVITATION_INVALID');
      const mail = await h.ctx.sql.query(
        'SELECT o.status FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash WHERE t.app_user_id = $1',
        [account.id],
      );
      expect(mail.rows).toEqual([{ status: 'CANCELLED' }]);
    });

    it('refuses to let the Super Admin lock, unlock or re-grant their own account (AC-13, AC-15)', async () => {
      const self = h.seed.superAdmin.appUserId;

      for (const path of ['lock', 'unlock']) {
        const response = await h.admin
          .post(`/api/v1/app-users/${self}/${path}`, { reason: 'A valid reason does not allow a self-change' })
          .expect(409);
        expect(errorCode(response)).toBe('APP_USER.SELF_CHANGE_FORBIDDEN');
      }
      expect(
        errorCode(await h.admin.post(`/api/v1/app-users/${self}/role-grants`, { role: 'EMPLOYEE' }).expect(409)),
      ).toBe('APP_USER.SELF_CHANGE_FORBIDDEN');
      expect(errorCode(await h.admin.delete(`/api/v1/app-users/${self}/role-grants/SUPER_ADMIN`).expect(409))).toBe(
        'APP_USER.SELF_CHANGE_FORBIDDEN',
      );
    });
  });

  describe('the reason of a lock or an unlock (US-01-01 AC-6, AC-7, AC-20)', () => {
    /** Every request body the contract refuses; each must leave the account and the Audit Trail as they were. */
    const UNUSABLE_BODIES: [string, object | undefined][] = [
      ['no body', undefined],
      ['an empty object', {}],
      ['a blank reason', { reason: '   ' }],
      ['a null reason', { reason: null }],
      ['a reason that is not a string', { reason: 42 }],
      ['a reason over 1000 characters', { reason: 'x'.repeat(1001) }],
      ['an unknown field next to the reason', { reason: 'Incident review', note: 'not part of the contract' }],
    ];

    const statusOf = async (appUserId: string) =>
      (await h.ctx.sql.query<{ status: string }>('SELECT status FROM app_users WHERE id = $1', [appUserId])).rows[0]
        .status;
    const auditOf = async (action: string, appUserId: string) =>
      (
        await h.ctx.sql.query<{ actor_app_user_id: string; before: unknown; after: unknown }>(
          `SELECT actor_app_user_id, before, after FROM audit_events
            WHERE action = $1 AND resource_id = $2 ORDER BY occurred_at, id`,
          [action, appUserId],
        )
      ).rows;
    const answersTo = async (path: string) => {
      const answers: [string, number, string | null][] = [];
      for (const [label, body] of UNUSABLE_BODIES) {
        const response = await h.admin.post(path, body);
        answers.push([label, response.status, response.status === 422 ? errorCode(response) : null]);
      }
      return answers;
    };
    const allRefused = UNUSABLE_BODIES.map(([label]): [string, number, string] => [label, 422, 'VALIDATION_ERROR']);

    it('refuses a lock without a usable reason with 422 and leaves the account and its session untouched', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      const { token } = await signIn(user.email, user.password);

      expect(await answersTo(`/api/v1/app-users/${user.appUserId}/lock`)).toEqual(allRefused);

      expect(await statusOf(user.appUserId)).toBe('ACTIVE');
      expect(await countAudit('APP_USER.LOCKED', user.appUserId)).toBe(0);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
    });

    it('refuses an unlock without a usable reason with 422 and keeps the account locked', async () => {
      const user = await activatedAccount();
      await h.admin.post(`/api/v1/app-users/${user.appUserId}/lock`, { reason: 'Contain the account' }).expect(200);

      expect(await answersTo(`/api/v1/app-users/${user.appUserId}/unlock`)).toEqual(allRefused);

      expect(await statusOf(user.appUserId)).toBe('LOCKED');
      expect(await countAudit('APP_USER.UNLOCKED', user.appUserId)).toBe(0);
    });

    it('records the trimmed reason with the actor and the state before and after, up to 1000 characters', async () => {
      const user = await activatedAccount();
      const longestReason = 'r'.repeat(1000);

      await h.admin
        .post(`/api/v1/app-users/${user.appUserId}/lock`, {
          reason: '  Sudden departure notice from the head, awaiting the HR letter  ',
        })
        .expect(200);
      await h.admin.post(`/api/v1/app-users/${user.appUserId}/unlock`, { reason: ` ${longestReason} ` }).expect(200);

      expect(await auditOf('APP_USER.LOCKED', user.appUserId)).toEqual([
        {
          actor_app_user_id: h.seed.superAdmin.appUserId,
          before: { status: 'ACTIVE' },
          after: {
            status: 'LOCKED',
            sessionsRevoked: 0,
            invitationsRevoked: 0,
            reason: 'Sudden departure notice from the head, awaiting the HR letter',
          },
        },
      ]);
      expect(await auditOf('APP_USER.UNLOCKED', user.appUserId)).toEqual([
        {
          actor_app_user_id: h.seed.superAdmin.appUserId,
          before: { status: 'LOCKED' },
          after: { status: 'ACTIVE', reason: longestReason },
        },
      ]);
      const employee = await h.ctx.sql.query<{ status: string }>('SELECT status FROM employees WHERE id = $1', [
        user.employeeId,
      ]);
      expect(employee.rows[0].status).toBe('ACTIVE');
    });

    it('still needs a valid reason when the account is already in the requested state, and writes no second event', async () => {
      const user = await activatedAccount();
      const lock = `/api/v1/app-users/${user.appUserId}/lock`;
      const unlock = `/api/v1/app-users/${user.appUserId}/unlock`;
      await h.admin.post(lock, { reason: 'First lock' }).expect(200);

      expect(errorCode(await h.admin.post(lock).expect(422))).toBe('VALIDATION_ERROR');
      expect(dataOf(await h.admin.post(lock, { reason: 'Repeated lock' }).expect(200)).status).toBe('LOCKED');
      await h.admin.post(unlock, { reason: 'First unlock' }).expect(200);
      expect(errorCode(await h.admin.post(unlock).expect(422))).toBe('VALIDATION_ERROR');
      expect(dataOf(await h.admin.post(unlock, { reason: 'Repeated unlock' }).expect(200)).status).toBe('ACTIVE');

      expect(await countAudit('APP_USER.LOCKED', user.appUserId)).toBe(1);
      expect(await countAudit('APP_USER.UNLOCKED', user.appUserId)).toBe(1);
      const stored = JSON.stringify([
        ...(await auditOf('APP_USER.LOCKED', user.appUserId)),
        ...(await auditOf('APP_USER.UNLOCKED', user.appUserId)),
      ]);
      expect(stored).not.toContain('Repeated');
    });
  });
});
