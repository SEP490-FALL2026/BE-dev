import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { AccountManagementHttpHarness, dataOf, errorCode } from '../../support/account-management-http-harness';

const h = new AccountManagementHttpHarness();
const change = (id: string, role: string) =>
  request(h.server()).put(`/api/v1/app-users/${id}/role`).set(h.as(h.adminToken)).send({ role });
const held = async (id: string) =>
  (
    await h.ctx.sql.query<{ role: string }>(
      'SELECT role::text FROM role_grants WHERE app_user_id = $1 AND revoked_at IS NULL',
      [id],
    )
  ).rows.map((row) => row.role);

describe('atomic change of the sole account role', () => {
  beforeAll(async () => {
    await h.start();
  }, 90000);
  afterEach(() => h.afterEach());
  afterAll(async () => {
    await h.stop();
  });

  it('replaces EMPLOYEE with MANAGER, preserves history, and does not create a head period', async () => {
    const user = await h.activatedAccount();
    const changed = dataOf(await change(user.appUserId, 'MANAGER').expect(200));
    expect(changed.roles).toEqual(['MANAGER']);
    expect(await held(user.appUserId)).toEqual(['MANAGER']);
    expect(changed.roleHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'EMPLOYEE', revokedAt: expect.any(String) as string }),
        expect.objectContaining({ role: 'MANAGER', revokedAt: null }),
      ]),
    );
    expect(
      (await h.ctx.sql.query('SELECT 1 FROM department_head_periods WHERE employee_id = $1', [user.employeeId]))
        .rowCount,
    ).toBe(0);
    const events = await h.ctx.sql.query<{ before: unknown; after: unknown }>(
      "SELECT before, after FROM audit_events WHERE action = 'ROLE.CHANGED' AND resource_id = $1",
      [user.appUserId],
    );
    expect(events.rows).toEqual([{ before: { role: 'EMPLOYEE' }, after: { role: 'MANAGER' } }]);
    await change(user.appUserId, 'EMPLOYEE').expect(200);
    expect(await held(user.appUserId)).toEqual(['EMPLOYEE']);
  });

  it('does not add grants or audit when the requested role is already held', async () => {
    const user = await h.activatedAccount(['IT_ADMIN']);
    const before = await h.ctx.sql.query('SELECT id FROM role_grants WHERE app_user_id = $1 ORDER BY id', [
      user.appUserId,
    ]);
    await change(user.appUserId, 'IT_ADMIN').expect(200);
    expect(
      (await h.ctx.sql.query('SELECT id FROM role_grants WHERE app_user_id = $1 ORDER BY id', [user.appUserId])).rows,
    ).toEqual(before.rows);
    expect(await h.countAudit('ROLE.CHANGED', user.appUserId)).toBe(0);
  });

  it('revokes the IT Admin authority at the next operation without ending the session', async () => {
    const user = await h.activatedAccount(['IT_ADMIN']);
    const { token } = await h.signIn(user.email, user.password);
    await request(h.server()).get('/api/v1/probe/it').set(h.as(token)).expect(200);
    await change(user.appUserId, 'EMPLOYEE').expect(200);
    await request(h.server()).get('/api/v1/probe/it').set(h.as(token)).expect(403);
    const me = await request(h.server()).get('/api/v1/me').set(h.as(token)).expect(200);
    expect(dataOf<{ roles: string[] }>(me).roles).toEqual(['EMPLOYEE']);
  });

  it('refuses self change, SUPER_ADMIN and a missing account without writing', async () => {
    const user = await h.activatedAccount();
    expect(errorCode(await change(h.seed.superAdmin.appUserId, 'EMPLOYEE').expect(409))).toBe(
      'APP_USER.SELF_CHANGE_FORBIDDEN',
    );
    expect(errorCode(await change(user.appUserId, 'SUPER_ADMIN').expect(422))).toBe(
      'APP_USER.SUPER_ADMIN_TRANSFER_ONLY',
    );
    expect(errorCode(await change('00000000-0000-4000-8000-000000000001', 'EMPLOYEE').expect(404))).toBe(
      'APP_USER.NOT_FOUND',
    );
    expect(await held(user.appUserId)).toEqual(['EMPLOYEE']);
  });

  it('serializes two changes of one account and records each effective replacement', async () => {
    const user = await h.activatedAccount();
    const answers = await Promise.all([change(user.appUserId, 'IT_ADMIN'), change(user.appUserId, 'MANAGER')]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
    expect(await held(user.appUserId)).toHaveLength(1);
    expect(await h.countAudit('ROLE.CHANGED', user.appUserId)).toBe(2);
  });

  it('keeps the Finance seat while invited or locked, and permits a new holder only after replacement', async () => {
    const first = await h.newEmployee();
    const invited = dataOf(
      await h.admin.post('/api/v1/app-users', { employeeId: first.employeeId, role: 'FINANCE' }).expect(201),
    );
    const other = await h.activatedAccount();
    expect(errorCode(await change(other.appUserId, 'FINANCE').expect(409))).toBe('APP_USER.FINANCE_ALREADY_ASSIGNED');
    await h.admin.post(`/api/v1/app-users/${invited.id}/lock`, { reason: 'Test locked holder' }).expect(200);
    expect(errorCode(await change(other.appUserId, 'FINANCE').expect(409))).toBe('APP_USER.FINANCE_ALREADY_ASSIGNED');
    await change(invited.id, 'EMPLOYEE').expect(200);
    await change(other.appUserId, 'FINANCE').expect(200);
    await change(other.appUserId, 'EMPLOYEE').expect(200);
    const next = await h.activatedAccount();
    const race = await Promise.all([change(other.appUserId, 'FINANCE'), change(next.appUserId, 'FINANCE')]);
    expect(race.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const winner = race[0].status === 200 ? other : next;
    await change(winner.appUserId, 'EMPLOYEE').expect(200);
  });

  it('refuses leaving MANAGER while heading now, heading later or named as a successor', async () => {
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    for (const from of [today, addDays(today, 5)]) {
      const head = await h.activatedAccount(['MANAGER']);
      await h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::date)`,
        [h.seed.organizationId, h.seed.departmentId, head.employeeId, from],
      );
      for (const role of ['EMPLOYEE', 'IT_ADMIN', 'SPENDING_APPROVER']) {
        expect(errorCode(await change(head.appUserId, role).expect(409))).toBe('APP_USER.MANAGER_STILL_HEADING');
      }
      expect(await held(head.appUserId)).toEqual(['MANAGER']);
      expect(await h.countAudit('ROLE.CHANGED', head.appUserId)).toBe(0);
      await h.ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [head.employeeId]);
      await change(head.appUserId, 'EMPLOYEE').expect(200);
    }
    const head = await h.activatedAccount(['MANAGER']);
    const heir = await h.activatedAccount(['MANAGER']);
    await h.admin
      .post(`/api/v1/departments/${h.seed.departmentId}/head-assignments`, {
        employeeId: head.employeeId,
        effectiveFrom: today,
      })
      .expect(200);
    await h.admin
      .post(`/api/v1/departments/${h.seed.departmentId}/successor-designations`, {
        employeeId: heir.employeeId,
        effectiveFrom: addDays(today, 5),
      })
      .expect(200);
    expect(errorCode(await change(heir.appUserId, 'IT_ADMIN').expect(409))).toBe('APP_USER.MANAGER_STILL_HEADING');
    await h.admin.post(`/api/v1/departments/${h.seed.departmentId}/successor-clearances`).expect(200);
    await change(heir.appUserId, 'EMPLOYEE').expect(200);
    await h.ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [head.employeeId]);
  });

  it('allows only one of two simultaneous spending approvers and then returns the holder to EMPLOYEE', async () => {
    const one = await h.activatedAccount(['IT_ADMIN']);
    const two = await h.activatedAccount(['MANAGER']);
    const results = await Promise.all([
      change(one.appUserId, 'SPENDING_APPROVER'),
      change(two.appUserId, 'SPENDING_APPROVER'),
    ]);
    expect(results.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const winner = results[0].status === 200 ? one : two;
    const loser = results[0].status === 409 ? results[0] : results[1];
    expect(errorCode(loser)).toBe('APP_USER.SPENDING_APPROVER_ALREADY_ASSIGNED');
    expect(await held(winner.appUserId)).toEqual(['SPENDING_APPROVER']);
    await change(winner.appUserId, 'EMPLOYEE').expect(200);
    expect(await held(winner.appUserId)).toEqual(['EMPLOYEE']);
  });
});
