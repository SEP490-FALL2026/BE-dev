import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/**
 * F2-2 (D-16): retiring a department refuses with 409 `DEPARTMENT.IN_USE` while the department still has:
 * - an OPEN device return task (`DEVICE_RETURN_TASK`),
 * - an unclosed SaaS issue report (`SAAS_ISSUE`), or
 * - an unclosed ghost seat recommendation/decision (`GHOST_SEAT_RECOMMENDATION`).
 * Once the open work is closed, deactivation succeeds.
 */
describe('departmentDeactivate open work checks: return tasks, SaaS issues, ghost seats (integration, F2-2)', () => {
  let today: string;
  let orgId: string;
  let actorAppUserId: string;
  let subscriptionId: string;
  let planId: string;
  let applicationId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    today = await h.ctx.app.get(OrganizationReadApi, { strict: false }).businessToday();
    orgId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
    actorAppUserId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM app_users LIMIT 1`)).rows[0].id;
    subscriptionId = await h.subscription(10, 'K2');
    planId = await h.planOf(subscriptionId);
    applicationId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
    ).rows[0].application_id;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('blocks deactivation while an OPEN device return task exists and allows it once closed', async () => {
    const dept = await h.department('P-F22-RET');
    const holderId = await h.person(`E-F22-${(counter += 1)}`);
    const assetCode = `LAP-26-99${counter}1`;
    const deviceId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO managed_devices (id, organization_id, asset_code, normalized_asset_code, hostname, os, device_type, asset_code_origin, created_by_app_user_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, lower($2), 'host-f22', 'Windows 11', 'LAP', 'GENERATED', $3, now())
         RETURNING id`,
        [orgId, assetCode, actorAppUserId],
      )
    ).rows[0].id;
    const regId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO device_registrations (id, organization_id, device_id, holder_employee_id, valid_from, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::date, $5)
         RETURNING id`,
        [orgId, deviceId, holderId, today, actorAppUserId],
      )
    ).rows[0].id;
    const taskId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO device_return_tasks (id, organization_id, device_id, registration_id, employee_id, offboarding_case_id, department_id, due_on, state)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::date, 'OPEN')
         RETURNING id`,
        [orgId, deviceId, regId, holderId, randomUUID(), dept.id, today],
      )
    ).rows[0].id;

    const blocked = await request(h.server())
      .post(`/api/v1/departments/${dept.id}/deactivate`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({})
      .expect(409);

    expect(h.codeOf(blocked)).toBe('DEPARTMENT.IN_USE');
    expect(h.detailsOf(blocked).openWork).toContainEqual({
      kind: 'DEVICE_RETURN_TASK',
      id: taskId,
      label: assetCode,
    });

    await h.ctx.sql.query(
      `UPDATE device_return_tasks SET state = 'CANCELLED', handled_by_app_user_id = $2, handled_at = now() WHERE id = $1`,
      [taskId, actorAppUserId],
    );

    await request(h.server())
      .post(`/api/v1/departments/${dept.id}/deactivate`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({})
      .expect(200);
  });

  it('blocks deactivation while an unclosed SaaS issue exists and allows it once closed', async () => {
    const dept = await h.department('P-F22-ISS');
    const reporterId = await h.person(`E-F22-${(counter += 1)}`);
    const assignmentId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, owning_department_id, account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, 'PERSONAL', 'REQUEST', $2, $3, $4, $5, $6, $6, $7::date, 'ACTUAL', $8)
         RETURNING id`,
        [orgId, planId, subscriptionId, reporterId, dept.id, `f22-${counter}@acme.vn`, today, actorAppUserId],
      )
    ).rows[0].id;
    const code = `BM11-2026-${String(990000 + counter).padStart(6, '0')}`;
    const issueId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO saas_issues (id, code, organization_id, reporter_employee_id, assignment_id, category, impact, description, occurred_at, state, response_due_on)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'NO_ACCESS', 'UNUSABLE', 'Cannot sign in', now(), 'NEW', $5::date)
         RETURNING id`,
        [code, orgId, reporterId, assignmentId, today],
      )
    ).rows[0].id;

    const blocked = await request(h.server())
      .post(`/api/v1/departments/${dept.id}/deactivate`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({})
      .expect(409);

    expect(h.codeOf(blocked)).toBe('DEPARTMENT.IN_USE');
    expect(h.detailsOf(blocked).openWork).toContainEqual({
      kind: 'SAAS_ISSUE',
      id: issueId,
      label: code,
    });

    await h.ctx.sql.query(
      `UPDATE saas_issues SET assigned_it_admin_employee_id = $3, state = 'RESOLVED', resolution = 'Resolved', resolved_at = now(), reopen_until = $2::date WHERE id = $1`,
      [issueId, today, h.it1.employeeId],
    );
    await h.ctx.sql.query(`UPDATE saas_issues SET state = 'CLOSED', closed_at = now() WHERE id = $1`, [issueId]);

    await request(h.server())
      .post(`/api/v1/departments/${dept.id}/deactivate`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({})
      .expect(200);
  });

  it('blocks deactivation while an unclosed ghost seat recommendation exists and allows it once closed', async () => {
    const dept = await h.department('P-F22-GHOST');
    const holderId = await h.person(`E-F22-${(counter += 1)}`);
    const assignmentId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, owning_department_id, account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, 'PERSONAL', 'REQUEST', $2, $3, $4, $5, $6, $6, $7::date, 'ACTUAL', $8)
         RETURNING id`,
        [orgId, planId, subscriptionId, holderId, dept.id, `f22-${counter}@acme.vn`, today, actorAppUserId],
      )
    ).rows[0].id;
    const runId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO ghost_seat_rule_runs (id, organization_id, rule_set, period_key, status, finished_at)
         VALUES (gen_random_uuid(), $1, 'G1_G2', $2, 'COMPLETED', now())
         RETURNING id`,
        [orgId, `f22-period-${counter}`],
      )
    ).rows[0].id;
    const recId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, tier, application_id, plan_id, subscription_id, assignment_id, seat_chain_id, employee_id, department_id, evidence, created_run_id)
         VALUES (gen_random_uuid(), $1, 'G2', 'OPEN', 'ACTION', $2, $3, $4, $5, $5, $6, $7, '{}'::jsonb, $8)
         RETURNING id`,
        [orgId, applicationId, planId, subscriptionId, assignmentId, holderId, dept.id, runId],
      )
    ).rows[0].id;

    const blocked = await request(h.server())
      .post(`/api/v1/departments/${dept.id}/deactivate`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({})
      .expect(409);

    expect(h.codeOf(blocked)).toBe('DEPARTMENT.IN_USE');
    expect(h.detailsOf(blocked).openWork).toContainEqual({
      kind: 'GHOST_SEAT_RECOMMENDATION',
      id: recId,
      label: 'G2',
    });

    await h.ctx.sql.query(
      `UPDATE ghost_seat_recommendations SET state = 'CLOSED', close_reason = 'SEAT_ENDED', closed_at = now() WHERE id = $1`,
      [recId],
    );

    await request(h.server())
      .post(`/api/v1/departments/${dept.id}/deactivate`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({})
      .expect(200);
  });
});
