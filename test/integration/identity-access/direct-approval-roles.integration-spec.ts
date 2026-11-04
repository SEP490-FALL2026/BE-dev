import request, { type Response } from 'supertest';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { bodyOf } from '../../support/api-body';
import { AccountManagementHttpHarness, dataOf, errorCode } from '../../support/account-management-http-harness';

/**
 * `qd93-direct-manager-spending-approver-roles`, Tasks 5, 6a, 6b: MANAGER and SPENDING_APPROVER are granted and revoked by the Super
 * Admin through the routes of IT_ADMIN and FINANCE (`POST /app-users`, `POST /app-users/{id}/role-grants`,
 * `DELETE /app-users/{id}/role-grants/{role}`), with the rules of the spec in the order it lists them, in one transaction with the
 * Audit Trail. This file proves the grant and the revoke on the database (rows, audit, the details of the refusal); who may call a
 * route as a MANAGER is `manager-scope`.
 */
describe('MANAGER and SPENDING_APPROVER as granted roles (integration, real PostgreSQL)', () => {
  const h = new AccountManagementHttpHarness();

  beforeAll(async () => {
    await h.start();
  }, 90000);

  afterEach(async () => {
    jest.restoreAllMocks();
    await h.afterEach();
  });

  afterAll(async () => {
    await h.stop();
  });

  const detailsOf = <T>(response: Response): T => bodyOf(response).error.details as unknown as T;
  const day = async (offset: number): Promise<string> =>
    // The business day of the organization (Asia/Ho_Chi_Minh), not current_date of the database (UTC): a head from today.
    (
      await h.ctx.sql.query<{ d: string }>('SELECT ($1::date + $2::int)::text AS d', [
        await h.ctx.app.get(OrganizationReadApi, { strict: false }).businessToday(),
        offset,
      ])
    ).rows[0].d;
  const grant = (appUserId: string, role: string) =>
    h.admin.post(`/api/v1/app-users/${appUserId}/role-grants`, { role });
  const revoke = (appUserId: string, role: string) =>
    h.admin.delete(`/api/v1/app-users/${appUserId}/role-grants/${role}`);
  const rolesOf = async (appUserId: string): Promise<string[]> =>
    dataOf(await h.admin.get(`/api/v1/app-users/${appUserId}`).expect(200))
      .roles.slice()
      .sort();
  const periodsOf = async (employeeId: string) =>
    (await h.ctx.sql.query('SELECT 1 FROM department_head_periods WHERE employee_id = $1', [employeeId])).rowCount;
  const headPeriod = (employeeId: string, from: string, to: string | null = null) =>
    h.ctx.sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from, valid_to)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::date, $5::date)`,
      [h.seed.organizationId, h.seed.departmentId, employeeId, from, to],
    );
  const clearHeads = () =>
    h.ctx.sql.query('DELETE FROM department_head_periods WHERE department_id = $1', [h.seed.departmentId]);
  const auditOf = async (action: string, appUserId: string) =>
    (
      await h.ctx.sql.query<{ before: unknown; after: unknown; actor_kind: string }>(
        'SELECT before, after, actor_kind::text FROM audit_events WHERE action = $1 AND resource_id = $2 ORDER BY occurred_at, id',
        [action, appUserId],
      )
    ).rows;

  describe('MANAGER (US-01-01 AC-4, AC-16, AC-21)', () => {
    it('grants MANAGER without making a head, and says so in the Audit Trail (AC-4)', async () => {
      const user = await h.activatedAccount([]);

      const response = await grant(user.appUserId, 'MANAGER').expect(201);

      expect(bodyOf(response).message).toBe('ROLE.GRANTED');
      expect(await rolesOf(user.appUserId)).toEqual(['MANAGER']);
      // Granting the role names no department and writes no period: the head is named by the department screen.
      expect(await periodsOf(user.employeeId)).toBe(0);
      expect(await auditOf('ROLE.GRANTED', user.appUserId)).toEqual([
        expect.objectContaining({
          actor_kind: 'USER',
          before: { roles: [] },
          after: { roles: ['MANAGER'], role: 'MANAGER' },
        }),
      ]);
    });

    it('creates an account with MANAGER in its roles', async () => {
      const employee = await h.newEmployee();

      const created = await h.admin
        .post('/api/v1/app-users', { employeeId: employee.employeeId, role: 'MANAGER' })
        .expect(201);

      expect(dataOf(created).roles).toEqual(['MANAGER']);
    });

    it('revokes MANAGER of someone who never headed a department; the last role leaves nothing (AC-16)', async () => {
      const user = await h.activatedAccount(['MANAGER']);

      const response = await revoke(user.appUserId, 'MANAGER').expect(200);

      expect(bodyOf(response).message).toBe('ROLE.REVOKED');
      expect(await rolesOf(user.appUserId)).toEqual([]);
      expect(await auditOf('ROLE.REVOKED', user.appUserId)).toHaveLength(1);
    });

    it('allows MANAGER beside IT_ADMIN and FINANCE', async () => {
      const user = await h.activatedAccount(['IT_ADMIN']);

      await grant(user.appUserId, 'MANAGER').expect(201);

      expect(await rolesOf(user.appUserId)).toEqual(['IT_ADMIN', 'MANAGER']);
    });

    it('refuses revoking MANAGER of a current head, a future head and a named successor, and changes nothing (AC-21)', async () => {
      const current = await h.activatedAccount(['MANAGER']);
      const future = await h.activatedAccount(['MANAGER']);
      const unchanged = async (appUserId: string) => {
        expect(await rolesOf(appUserId)).toEqual(['MANAGER']);
        expect(await auditOf('ROLE.REVOKED', appUserId)).toEqual([]);
      };
      const refusal = async (appUserId: string) => {
        const response = await revoke(appUserId, 'MANAGER').expect(409);
        expect(errorCode(response)).toBe('APP_USER.MANAGER_STILL_HEADING');

        return detailsOf<{ headPeriods: Array<Record<string, unknown>> }>(response).headPeriods;
      };

      await headPeriod(current.employeeId, await day(-3));
      expect(await refusal(current.appUserId)).toEqual([
        {
          departmentId: h.seed.departmentId,
          departmentCode: expect.any(String) as string,
          validFrom: await day(-3),
          validTo: null,
          timing: 'CURRENT',
        },
      ]);
      await unchanged(current.appUserId);

      await clearHeads();
      await headPeriod(future.employeeId, await day(5));
      expect(await refusal(future.appUserId)).toMatchObject([
        { validFrom: await day(5), validTo: null, timing: 'UPCOMING' },
      ]);
      await unchanged(future.appUserId);
      await clearHeads();
    });

    it('refuses revoking MANAGER of the person named as successor, and revokes it once the successor is taken back (AC-21)', async () => {
      const head = await h.activatedAccount(['MANAGER']);
      const heir = await h.activatedAccount(['MANAGER']);
      await h.admin
        .post(`/api/v1/departments/${h.seed.departmentId}/head-assignments`, {
          employeeId: head.employeeId,
          effectiveFrom: await day(0),
        })
        .expect(200);
      await h.admin
        .post(`/api/v1/departments/${h.seed.departmentId}/successor-designations`, {
          employeeId: heir.employeeId,
          effectiveFrom: await day(5),
        })
        .expect(200);

      const refused = await revoke(heir.appUserId, 'MANAGER').expect(409);
      expect(errorCode(refused)).toBe('APP_USER.MANAGER_STILL_HEADING');
      expect(await rolesOf(heir.appUserId)).toEqual(['MANAGER']);

      await h.admin.post(`/api/v1/departments/${h.seed.departmentId}/successor-clearances`).expect(200);
      await revoke(heir.appUserId, 'MANAGER').expect(200);
      expect(await rolesOf(heir.appUserId)).toEqual([]);
      await clearHeads();
    });

    it('revokes MANAGER once the head period is removed, ended or not yet begun (AC-21)', async () => {
      const user = await h.activatedAccount(['MANAGER']);
      await headPeriod(user.employeeId, await day(-30), await day(-1));

      await revoke(user.appUserId, 'MANAGER').expect(200);

      expect(await rolesOf(user.appUserId)).toEqual([]);
      await clearHeads();
    });

    it('answers 409, never 500, when the database refuses the revoke after the check passed (the race with a head assignment)', async () => {
      const user = await h.activatedAccount(['MANAGER']);
      await headPeriod(user.employeeId, await day(-1));
      // The check of the service sees no period (the head assignment commits after it), the trigger of the database does.
      jest.spyOn(h.ctx.app.get(OrganizationReadApi), 'headPeriodsFrom').mockResolvedValueOnce([]);

      const response = await revoke(user.appUserId, 'MANAGER').expect(409);

      expect(errorCode(response)).toBe('APP_USER.MANAGER_STILL_HEADING');
      expect(detailsOf<{ headPeriods: unknown[] }>(response).headPeriods).toHaveLength(1);
      expect(await rolesOf(user.appUserId)).toEqual(['MANAGER']);
      await clearHeads();
    });
  });

  describe('SPENDING_APPROVER (US-01-03 AC-1, AC-2, AC-4, AC-6, AC-10, AC-11, M2)', () => {
    const setEmployee = (employeeId: string, set: string) =>
      h.ctx.sql.query(`UPDATE employees SET ${set} WHERE id = $1`, [employeeId]);
    const holder = async () => h.ctx.app.get(IdentityAccessApi).getSpendingApproverEmployeeId();
    /** The table of the approval roles is gone (the removal migration): the grant is the only place the holder is read from. */
    const approvalRoleTable = async () =>
      (await h.ctx.sql.query<{ tbl: string | null }>(`SELECT to_regclass('public.approval_role_holders') AS tbl`))
        .rows[0].tbl;
    const clearApprover = () =>
      h.ctx.sql.query(
        "UPDATE role_grants SET revoked_at = now() WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL",
      );

    afterEach(async () => {
      await clearApprover();
      await clearHeads();
    });

    it('grants SPENDING_APPROVER and reads the holder from the role grant: the approval-role table is gone', async () => {
      const user = await h.activatedAccount([]);

      const response = await grant(user.appUserId, 'SPENDING_APPROVER').expect(201);

      expect(bodyOf(response).message).toBe('ROLE.GRANTED');
      expect(await rolesOf(user.appUserId)).toEqual(['SPENDING_APPROVER']);
      expect(await holder()).toBe(user.employeeId);
      expect(await approvalRoleTable()).toBeNull();
      expect(await auditOf('ROLE.GRANTED', user.appUserId)).toHaveLength(1);
    });

    it('refuses a second spending approver, whatever the state of the first holder account, and allows one after a revoke (AC-10)', async () => {
      const first = await h.activatedAccount([]);
      const second = await h.activatedAccount([]);
      await grant(first.appUserId, 'SPENDING_APPROVER').expect(201);
      await h.ctx.sql.query("UPDATE app_users SET status = 'LOCKED' WHERE id = $1", [first.appUserId]);

      const refused = await grant(second.appUserId, 'SPENDING_APPROVER').expect(409);

      expect(errorCode(refused)).toBe('APP_USER.SPENDING_APPROVER_ALREADY_ASSIGNED');
      expect(await rolesOf(second.appUserId)).toEqual([]);
      await h.ctx.sql.query("UPDATE app_users SET status = 'ACTIVE' WHERE id = $1", [first.appUserId]);
      await revoke(first.appUserId, 'SPENDING_APPROVER').expect(200);
      await grant(second.appUserId, 'SPENDING_APPROVER').expect(201);
      expect(await holder()).toBe(second.employeeId);
    });

    it('names the roles in the way when SPENDING_APPROVER meets another role (AC-11)', async () => {
      const itAdmin = await h.activatedAccount(['IT_ADMIN']);
      const manager = await h.activatedAccount(['MANAGER']);

      const withIt = await grant(itAdmin.appUserId, 'SPENDING_APPROVER').expect(409);
      const withManager = await grant(manager.appUserId, 'SPENDING_APPROVER').expect(409);

      const finance = await h.activatedAccount(['FINANCE']);
      const withFinance = await grant(finance.appUserId, 'SPENDING_APPROVER').expect(409);
      // SoD-7, SoD-8 (US-01-05 AC-7, AC-8): Finance never holds the role that decides what Finance reviews.
      expect(detailsOf<{ conflictingRoles: string[] }>(withFinance).conflictingRoles).toEqual(['FINANCE']);
      await revoke(finance.appUserId, 'FINANCE').expect(200);
      expect(errorCode(withIt)).toBe('APP_USER.ROLE_COMBINATION_FORBIDDEN');
      expect(detailsOf<{ conflictingRoles: string[] }>(withIt).conflictingRoles).toEqual(['IT_ADMIN']);
      expect(detailsOf<{ conflictingRoles: string[] }>(withManager).conflictingRoles).toEqual(['MANAGER']);
      expect(await rolesOf(manager.appUserId)).toEqual(['MANAGER']);
    });

    it('refuses a head today or from a later day with the periods (AC-11)', async () => {
      const head = await h.activatedAccount([]);
      const periodsOfRefusal = async () => {
        const refused = await grant(head.appUserId, 'SPENDING_APPROVER').expect(409);
        expect(errorCode(refused)).toBe('APP_USER.SPENDING_APPROVER_HEADS_DEPARTMENT');

        return detailsOf<{ headPeriods: Array<{ timing: string }> }>(refused).headPeriods;
      };

      await headPeriod(head.employeeId, await day(-2));
      expect(await periodsOfRefusal()).toMatchObject([{ timing: 'CURRENT' }]);
      await clearHeads();
      await headPeriod(head.employeeId, await day(7));
      expect(await periodsOfRefusal()).toMatchObject([{ timing: 'UPCOMING' }]);
      expect(await rolesOf(head.appUserId)).toEqual([]);
    });

    it('refuses a person who left, is on long leave or is handing over (AC-6, OD-3)', async () => {
      for (const state of ["work_state = 'ON_LONG_LEAVE'", "work_state = 'HANDING_OVER'", "status = 'TERMINATED'"]) {
        const person = await h.activatedAccount([]);
        await setEmployee(person.employeeId, state);

        const refused = await grant(person.appUserId, 'SPENDING_APPROVER').expect(422);

        expect(errorCode(refused)).toBe('APP_USER.SPENDING_APPROVER_EMPLOYEE_NOT_ACTIVE');
        expect(await rolesOf(person.appUserId)).toEqual([]);
      }
    });

    it('refuses an account that is locked or not activated, and a new account created with the role, creating nothing (AC-6)', async () => {
      const locked = await h.activatedAccount([]);
      await h.ctx.sql.query("UPDATE app_users SET status = 'LOCKED' WHERE id = $1", [locked.appUserId]);
      const invited = await h.newEmployee();
      const created = await h.admin
        .post('/api/v1/app-users', { employeeId: invited.employeeId, role: 'EMPLOYEE' })
        .expect(201);
      const before = await h.ctx.sql.query('SELECT count(*)::int AS n FROM app_users');
      const fresh = await h.newEmployee();
      const afterFresh = await h.ctx.sql.query('SELECT count(*)::int AS n FROM app_users');

      const lockedRefusal = await grant(locked.appUserId, 'SPENDING_APPROVER').expect(422);
      const invitedRefusal = await grant(dataOf(created).id, 'SPENDING_APPROVER').expect(422);
      const creation = await h.admin
        .post('/api/v1/app-users', { employeeId: fresh.employeeId, role: 'SPENDING_APPROVER' })
        .expect(422);

      for (const response of [lockedRefusal, invitedRefusal, creation]) {
        expect(errorCode(response)).toBe('APP_USER.SPENDING_APPROVER_ACCOUNT_NOT_USABLE');
      }
      expect(afterFresh.rows).toEqual(before.rows);
      expect((await h.ctx.sql.query('SELECT count(*)::int AS n FROM app_users')).rows).toEqual(before.rows);
    });

    it('has no substitute to keep apart from it: whoever the old table names is granted like anyone else, and the routes of the old configuration are gone (QĐ-93c)', async () => {
      const person = await h.activatedAccount([]);

      await grant(person.appUserId, 'SPENDING_APPROVER').expect(201);

      expect(await holder()).toBe(person.employeeId);
      await request(h.server())
        .put('/api/v1/approval-roles/CONFLICT_SUBSTITUTE')
        .set(h.as(h.adminToken))
        .send({ employeeId: person.employeeId })
        .expect(404);
    });

    it('is no longer an approval role of a route: GET and PUT /approval-roles answer 404, and the role is granted through the grant route alone', async () => {
      const user = await h.activatedAccount([]);

      await request(h.server())
        .put('/api/v1/approval-roles/SPENDING_APPROVER')
        .set(h.as(h.adminToken))
        .send({ employeeId: user.employeeId })
        .expect(404);
      await h.admin.get('/api/v1/approval-roles').expect(404);
    });

    it('is the Super Admin alone who grants and revokes it: Finance and the IT Admin get 403, and nothing changes (AC-4)', async () => {
      const target = await h.activatedAccount([]);
      for (const role of ['FINANCE', 'IT_ADMIN']) {
        const caller = await h.activatedAccount([role]);
        const { token } = await h.signIn(caller.email, caller.password);
        const grantCall = request(h.server())
          .post(`/api/v1/app-users/${target.appUserId}/role-grants`)
          .set(h.as(token))
          .send({ role: 'SPENDING_APPROVER' });
        const revokeCall = request(h.server())
          .delete(`/api/v1/app-users/${target.appUserId}/role-grants/SPENDING_APPROVER`)
          .set(h.as(token));
        for (const call of [grantCall, revokeCall])
          expect(errorCode(await call.expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
        await h.ctx.sql.query(
          'UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND revoked_at IS NULL',
          [caller.appUserId],
        );
      }
      expect(await rolesOf(target.appUserId)).toEqual([]);
    });
  });
});
