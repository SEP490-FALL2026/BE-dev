import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { stopCliProcesses } from '../../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const MIGRATION = migrationEndingWith('_requests_drop_project_label');

describe('drop project_label migration (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;

  afterEach(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it(
    'drops project_label column and cleans draft policy projectLabel key',
    async () => {
      database = await provisionDisposableDatabase();
      sql = new Client({ connectionString: database.url });
      await sql.connect();

      const before = await deployMigrations(database, { through: migrationBefore(MIGRATION) });
      expect(before.code).toBe(0);

      const orgId = randomUUID();
      const deptId = randomUUID();
      const costCenterId = randomUUID();
      const empId = randomUUID();
      const appUserId = randomUUID();
      const appId = randomUUID();
      const planId = randomUUID();

      await sql.query(
        `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', 'Asia/Ho_Chi_Minh', 'VND')`,
        [orgId],
      );
      await sql.query(
        `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'DEPT-1', 'Engineering', now())`,
        [deptId, orgId],
      );
      await sql.query(
        `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at) VALUES ($1, $2, 'CC-01', 'Engineering CC', 'UNIT', 'ACTIVE', $3, now())`,
        [costCenterId, orgId, deptId],
      );
      await sql.query(
        `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, employment_type, hire_date, updated_at) VALUES ($1, $2, 'EMP-001', 'Test Person', 'emp1@corp.test', 'STAFF'::"EmploymentType", now()::date, now())`,
        [empId, orgId],
      );
      await sql.query(
        `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, updated_at) VALUES ($1, $2, $3, 'user@acme.test', 'user@acme.test', 'ACTIVE', now())`,
        [appUserId, orgId, empId],
      );
      await sql.query(
        `INSERT INTO applications (
        id, organization_id, kind, name, normalized_name,
        business_owner_employee_id, data_sensitivity,
        comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox,
        is_communication_service
      ) VALUES ($1, $2, 'INTERNAL', 'Internal App', 'internal app', $3, 'LOW', false, false, false, false)`,
        [appId, orgId, empId],
      );
      await sql.query(
        `INSERT INTO plans (
        id, organization_id, application_id, name, normalized_name, provisioning_type
      ) VALUES ($1, $2, $3, 'Internal Plan', 'internal plan', 'K5')`,
        [planId, orgId, appId],
      );

      const submittedId = randomUUID();
      const draftWithKeyId = randomUUID();
      const draftWithoutKeyId = randomUUID();

      // 1. Submitted request with project_label
      await sql.query(
        `INSERT INTO access_requests (
        id, organization_id, branch, state, plan_id, requester_employee_id,
        department_id, cost_center_id, business_reason, term_months, policy,
        created_by_app_user_id, project_label
      ) VALUES ($1, $2, 'INTERNAL_FREE', 'PENDING', $3, $4, $5, $6, 'Testing', 6, '{"version": 1}'::jsonb, $7, 'Special Project')`,
        [submittedId, orgId, planId, empId, deptId, costCenterId, appUserId],
      );

      // 2. Draft request with draft.projectLabel
      await sql.query(
        `INSERT INTO access_requests (
        id, organization_id, branch, state, plan_id, requester_employee_id,
        department_id, cost_center_id, business_reason, term_months, policy,
        created_by_app_user_id, submitted_at
      ) VALUES ($1, $2, 'INTERNAL_FREE', 'DRAFT', $3, $4, $5, $6, 'Testing Draft', 6, '{"draft": {"projectLabel": "Old Draft Label", "keepMe": true}}'::jsonb, $7, NULL)`,
        [draftWithKeyId, orgId, planId, empId, deptId, costCenterId, appUserId],
      );

      // 3. Draft request without draft.projectLabel
      await sql.query(
        `INSERT INTO access_requests (
        id, organization_id, branch, state, plan_id, requester_employee_id,
        department_id, cost_center_id, business_reason, term_months, policy,
        created_by_app_user_id, submitted_at
      ) VALUES ($1, $2, 'INTERNAL_FREE', 'DRAFT', $3, $4, $5, $6, 'Testing Draft 2', 6, '{"draft": {"keepMe": true}}'::jsonb, $7, NULL)`,
        [draftWithoutKeyId, orgId, planId, empId, deptId, costCenterId, appUserId],
      );

      const deploy = await deployMigrations(database, { through: MIGRATION });
      expect(deploy.code).toBe(0);

      // Verify column project_label dropped from access_requests
      const colRes = await sql.query(
        `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'access_requests' AND column_name = 'project_label'`,
      );
      expect(colRes.rows).toHaveLength(0);

      // Verify draftWithKey has projectLabel removed from policy->'draft'
      const draft1Res = await sql.query<{ policy: { draft: Record<string, unknown> } }>(
        `SELECT policy FROM access_requests WHERE id = $1`,
        [draftWithKeyId],
      );
      expect(draft1Res.rows[0].policy.draft).toEqual({ keepMe: true });

      // Verify draftWithoutKey is untouched
      const draft2Res = await sql.query<{ policy: { draft: Record<string, unknown> } }>(
        `SELECT policy FROM access_requests WHERE id = $1`,
        [draftWithoutKeyId],
      );
      expect(draft2Res.rows[0].policy.draft).toEqual({ keepMe: true });

      // Verify submitted request is intact
      const subRes = await sql.query<{ id: string; state: string }>(
        `SELECT id, state FROM access_requests WHERE id = $1`,
        [submittedId],
      );
      expect(subRes.rows).toHaveLength(1);
      expect(subRes.rows[0].state).toBe('PENDING');
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
