import request from 'supertest';
import { AccountStatusService } from '../../../src/modules/identity-access/accounts/app-users/account-status.service';
import { SuperAdminHolderNotLockableError } from '../../../src/modules/identity-access/accounts/account.errors';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { bodyOf } from '../../support/api-body';
import {
  AccountManagementHttpHarness,
  type AccountView,
  dataOf,
  errorCode,
} from '../../support/account-management-http-harness';

describe('account management over HTTP (integration, real PostgreSQL): role grants, access to the routes, listing, messages and the two guarded cases', () => {
  const h = new AccountManagementHttpHarness();
  const { server, signIn, as, newEmployee, activatedAccount, countAudit } = h;

  beforeAll(async () => {
    await h.start();
  }, 90000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('role grants (US-01-01 AC-2, AC-4, AC-7, AC-12, AC-14, AC-16, AC-17, AC-18)', () => {
    it('adds EMPLOYEE, then revoking IT_ADMIN stops IT routes at the next request while EMPLOYEE keeps working', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      const { token } = await signIn(user.email, user.password);
      await h.admin.post(`/api/v1/app-users/${user.appUserId}/role-grants`, { role: 'EMPLOYEE' }).expect(201);
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(200);
      await request(server()).get('/api/v1/probe/employee').set(as(token)).expect(200);

      const revoked = await h.admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/IT_ADMIN`).expect(200);

      expect(bodyOf(revoked).message).toBe('ROLE.REVOKED');
      await request(server()).get('/api/v1/probe/it').set(as(token)).expect(403);
      await request(server()).get('/api/v1/probe/employee').set(as(token)).expect(200);
    });

    it('allows revoking the last role: the account then only reaches self-service routes', async () => {
      const user = await activatedAccount(['EMPLOYEE']);
      const { token } = await signIn(user.email, user.password);

      await h.admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/EMPLOYEE`).expect(200);

      await request(server()).get('/api/v1/probe/employee').set(as(token)).expect(403);
      const me = await request(server()).get('/api/v1/me').set(as(token)).expect(200);
      expect(dataOf<{ selfServiceOnly: boolean }>(me).selfServiceOnly).toBe(true);
    });

    it('keeps the history of grants and revocations on the account detail', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      await h.admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/IT_ADMIN`).expect(200);
      await h.admin.post(`/api/v1/app-users/${user.appUserId}/role-grants`, { role: 'IT_ADMIN' }).expect(201);

      const detail = dataOf(await h.admin.get(`/api/v1/app-users/${user.appUserId}`).expect(200));

      expect(detail.roles).toEqual(['IT_ADMIN']);
      expect(detail.roleHistory?.filter((entry) => entry.role === 'IT_ADMIN')).toHaveLength(2);
      expect(detail.roleHistory?.filter((entry) => entry.revokedAt !== null)).toHaveLength(1);
    });

    it('refuses derived, transfer-only, repeated, missing and forbidden-combination roles with their own codes', async () => {
      const user = await activatedAccount(['IT_ADMIN']);
      const grant = (role: string) => h.admin.post(`/api/v1/app-users/${user.appUserId}/role-grants`, { role });

      expect(errorCode(await grant('MANAGER').expect(422))).toBe('APP_USER.ROLE_DERIVED');
      expect(errorCode(await grant('SUPER_ADMIN').expect(422))).toBe('APP_USER.SUPER_ADMIN_TRANSFER_ONLY');
      expect(errorCode(await grant('IT_ADMIN').expect(409))).toBe('APP_USER.ROLE_ALREADY_GRANTED');
      expect(
        errorCode(await h.admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/FINANCE`).expect(404)),
      ).toBe('APP_USER.ROLE_NOT_GRANTED');
      expect(
        errorCode(await h.admin.delete(`/api/v1/app-users/${user.appUserId}/role-grants/SUPER_ADMIN`).expect(422)),
      ).toBe('APP_USER.SUPER_ADMIN_TRANSFER_ONLY');
    });

    it('allows only one Finance: a holder who is still invited or locked keeps the place; revoking frees it (AC-18)', async () => {
      const first = await newEmployee();
      const second = await newEmployee();
      const invited = dataOf(
        await h.admin.post('/api/v1/app-users', { employeeId: first.employeeId, roles: ['FINANCE'] }).expect(201),
      );
      const other = dataOf(
        await h.admin.post('/api/v1/app-users', { employeeId: second.employeeId, roles: [] }).expect(201),
      );

      const whileInvited = await h.admin
        .post(`/api/v1/app-users/${other.id}/role-grants`, { role: 'FINANCE' })
        .expect(409);
      await h.admin
        .post(`/api/v1/app-users/${invited.id}/lock`, { reason: 'A locked Finance holder keeps the place' })
        .expect(200);
      const whileLocked = await h.admin
        .post(`/api/v1/app-users/${other.id}/role-grants`, { role: 'FINANCE' })
        .expect(409);
      await h.admin.delete(`/api/v1/app-users/${invited.id}/role-grants/FINANCE`).expect(200);
      const afterRevoke = await h.admin
        .post(`/api/v1/app-users/${other.id}/role-grants`, { role: 'FINANCE' })
        .expect(201);

      expect(errorCode(whileInvited)).toBe('APP_USER.FINANCE_ALREADY_ASSIGNED');
      expect(errorCode(whileLocked)).toBe('APP_USER.FINANCE_ALREADY_ASSIGNED');
      expect(bodyOf(afterRevoke).message).toBe('ROLE.GRANTED');
      await h.admin.delete(`/api/v1/app-users/${other.id}/role-grants/FINANCE`).expect(200);
    });

    it('lets exactly one of two simultaneous Finance grants through', async () => {
      const first = dataOf(
        await h.admin
          .post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: [] })
          .expect(201),
      );
      const second = dataOf(
        await h.admin
          .post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: [] })
          .expect(201),
      );

      const results = await Promise.all([
        h.admin.post(`/api/v1/app-users/${first.id}/role-grants`, { role: 'FINANCE' }),
        h.admin.post(`/api/v1/app-users/${second.id}/role-grants`, { role: 'FINANCE' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const held = await h.ctx.sql.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM role_grants WHERE role = 'FINANCE' AND revoked_at IS NULL",
      );
      expect(held.rows[0].n).toBe(1);
      await h.ctx.sql.query("UPDATE role_grants SET revoked_at = now() WHERE role = 'FINANCE' AND revoked_at IS NULL");
    });
  });

  describe('access to the management routes (US-01-01 AC-3)', () => {
    it('answers 403 to an IT Admin and changes nothing', async () => {
      const itAdmin = await activatedAccount(['IT_ADMIN']);
      const { token } = await signIn(itAdmin.email, itAdmin.password);
      const employee = await newEmployee();
      const before = await h.ctx.sql.query('SELECT count(*)::int AS n FROM app_users');

      const created = await request(server())
        .post('/api/v1/app-users')
        .set(as(token))
        .send({ employeeId: employee.employeeId, roles: [] })
        .expect(403);
      await request(server()).get('/api/v1/app-users').set(as(token)).expect(403);
      await request(server()).get('/api/v1/account-candidates').set(as(token)).expect(403);
      await request(server())
        .post(`/api/v1/app-users/${itAdmin.appUserId}/lock`)
        .set(as(token))
        .send({ reason: 'A valid reason does not grant the role' })
        .expect(403);

      expect(errorCode(created)).toBe('AUTHORIZATION.FORBIDDEN');
      expect((await h.ctx.sql.query('SELECT count(*)::int AS n FROM app_users')).rows).toEqual(before.rows);
    });

    it('requires a sign-in', async () => {
      await request(server()).get('/api/v1/app-users').expect(401);
    });
  });

  describe('listing', () => {
    it('filters accounts by activation state and role, with paging', async () => {
      const invited = dataOf(
        await h.admin
          .post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: ['EMPLOYEE'] })
          .expect(201),
      );

      const page = dataOf<{ items: AccountView[]; pagination: { totalItems: number } }>(
        await h.admin.get('/api/v1/app-users?activationState=INVITED&role=EMPLOYEE&pageSize=100').expect(200),
      );

      expect(page.items.map((item) => item.id)).toContain(invited.id);
      expect(page.items.every((item) => item.activationState === 'INVITED' && item.roles.includes('EMPLOYEE'))).toBe(
        true,
      );
      expect(page.pagination.totalItems).toBe(page.items.length);
    });

    it('shows the invitation delivery state on the detail', async () => {
      const account = dataOf(
        await h.admin
          .post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: [] })
          .expect(201),
      );

      const detail = dataOf(await h.admin.get(`/api/v1/app-users/${account.id}`).expect(200));

      expect(detail.invitation).toMatchObject({ usable: true, delivery: { status: 'PENDING' } });
      await h.admin.get('/api/v1/app-users/9b8c6f5e-0000-4000-8000-000000000000').expect(404);
    });
  });

  describe('success messages (H2b)', () => {
    it('answers the account list and detail with their own message, data unchanged', async () => {
      const account = dataOf(
        await h.admin
          .post('/api/v1/app-users', { employeeId: (await newEmployee()).employeeId, roles: [] })
          .expect(201),
      );

      const listed = await h.admin.get('/api/v1/app-users?pageSize=100').expect(200);
      const detail = await h.admin.get(`/api/v1/app-users/${account.id}`).expect(200);

      expect(bodyOf(listed)).toMatchObject({ success: true, message: 'APP_USER.LISTED' });
      expect(dataOf<{ items: AccountView[] }>(listed).items.map((item) => item.id)).toContain(account.id);
      expect(bodyOf(detail)).toMatchObject({ success: true, message: 'APP_USER.RETRIEVED' });
      expect(dataOf(detail).id).toBe(account.id);
    });

    it('answers readiness with its own message when PostgreSQL is reachable', async () => {
      const response = await request(server()).get('/api/v1/health/ready').expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'HEALTH.READINESS_CHECKED',
        data: { status: 'ready', checks: [{ name: 'database', status: 'up' }] },
      });
    });
  });

  describe('locking the SUPER_ADMIN holder from another account (R-08)', () => {
    it('is refused and leaves the account untouched', async () => {
      const other = await activatedAccount(['IT_ADMIN']);
      const actor = {
        subject: other.appUserId,
        appUserId: other.appUserId,
        sessionId: other.appUserId,
        employeeId: other.employeeId,
        directRoles: ['IT_ADMIN'],
        derivedRoles: [],
        roles: ['IT_ADMIN'],
      };
      const lockedBefore = await countAudit('APP_USER.LOCKED', h.seed.superAdmin.appUserId);

      await expect(
        h.ctx.app
          .get(AccountStatusService)
          .lock(actor, h.seed.superAdmin.appUserId, 'A reason does not unlock the holder protection'),
      ).rejects.toBeInstanceOf(SuperAdminHolderNotLockableError);

      const { rows } = await h.ctx.sql.query<{ status: string }>('SELECT status FROM app_users WHERE id = $1', [
        h.seed.superAdmin.appUserId,
      ]);
      expect(rows[0].status).toBe('ACTIVE');
      expect(await countAudit('APP_USER.LOCKED', h.seed.superAdmin.appUserId)).toBe(lockedBefore);
    });
  });

  describe('the invitation of an employee who has left (R-05)', () => {
    it('is reported unusable and is not offered to the mail dispatcher', async () => {
      const employee = await newEmployee();
      const account = dataOf(await h.admin.post('/api/v1/app-users', { employeeId: employee.employeeId }).expect(201));
      const tokenHash = (
        await h.ctx.sql.query<{ token_hash: string }>(
          'SELECT token_hash FROM account_action_tokens WHERE app_user_id = $1',
          [account.id],
        )
      ).rows[0].token_hash;
      const identity = h.ctx.app.get(IdentityAccessApi);
      await expect(identity.isActionLinkUsable(tokenHash)).resolves.toBe(true);

      await h.ctx.sql.query("UPDATE employees SET status = 'TERMINATED' WHERE id = $1", [employee.employeeId]);

      const detail = dataOf(await h.admin.get(`/api/v1/app-users/${account.id}`).expect(200));
      expect(detail.invitation?.usable).toBe(false);
      await expect(identity.isActionLinkUsable(tokenHash)).resolves.toBe(false);
    });
  });
});
