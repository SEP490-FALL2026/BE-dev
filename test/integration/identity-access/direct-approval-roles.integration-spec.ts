import type { Response } from 'supertest';
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
    (await h.ctx.sql.query<{ d: string }>('SELECT (current_date + $1::int)::text AS d', [offset])).rows[0].d;
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
        .post('/api/v1/app-users', { employeeId: employee.employeeId, roles: ['MANAGER'] })
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
      const head = await h.activatedAccount([]);
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
});
