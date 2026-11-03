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

const MIGRATION = migrationEndingWith('_identity_drop_approval_role_holders');
const CHECK_VIOLATION = '23514';

describe('drop approval_role_holders migration (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;

  afterEach(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it(
    'halts with error code P0001 when blocking approval_role_holders rows remain',
    async () => {
      database = await provisionDisposableDatabase();
      sql = new Client({ connectionString: database.url });
      await sql.connect();

      const before = await deployMigrations(database, { through: migrationBefore(MIGRATION) });
      expect(before.code).toBe(0);

      const orgId = randomUUID();
      const deptId = randomUUID();
      const empId = randomUUID();
      await sql.query(
        `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', 'Asia/Ho_Chi_Minh', 'VND')`,
        [orgId],
      );
      await sql.query(
        `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'DEPT-1', 'Engineering', now())`,
        [deptId, orgId],
      );
      await sql.query(
        `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, employment_type, hire_date, updated_at) VALUES ($1, $2, 'EMP-001', 'Test Person', 'emp1@corp.test', 'STAFF'::"EmploymentType", now()::date, now())`,
        [empId, orgId],
      );
      await sql.query(
        `INSERT INTO approval_role_holders (id, organization_id, role, employee_id, held_from)
       VALUES (gen_random_uuid(), $1, 'FALLBACK_APPROVER'::"ApprovalRole", $2, now())`,
        [orgId, empId],
      );

      const attempt = await deployMigrations(database, { through: MIGRATION });
      expect(attempt.code).not.toBe(0);
      expect(attempt.stderr + attempt.stdout).toMatch(/P0001|approval_role_holders/i);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it(
    'drops approval_role_holders and type when clean, and trigger still forbids Super Admin from heading a department',
    async () => {
      database = await provisionDisposableDatabase();
      sql = new Client({ connectionString: database.url });
      await sql.connect();

      const deploy = await deployMigrations(database, { through: MIGRATION });
      expect(deploy.code).toBe(0);

      // Verify table approval_role_holders is dropped
      const tableRes = await sql.query<{ tbl: string | null }>(
        `SELECT to_regclass('public.approval_role_holders') AS tbl`,
      );
      expect(tableRes.rows[0].tbl).toBeNull();

      // Verify type ApprovalRole is dropped
      const typeRes = await sql.query<{ typ: string | null }>(`SELECT to_regtype('public."ApprovalRole"') AS typ`);
      expect(typeRes.rows[0].typ).toBeNull();

      // Verify trigger role_grants_super_admin_exclusions still forbids Super Admin for department heads
      const orgId = randomUUID();
      const deptId = randomUUID();
      const empId = randomUUID();
      const userId = randomUUID();

      await sql.query(
        `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', 'Asia/Ho_Chi_Minh', 'VND')`,
        [orgId],
      );
      await sql.query(
        `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'DEPT-HEAD', 'Finance Dept', now())`,
        [deptId, orgId],
      );
      await sql.query(
        `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, employment_type, hire_date, updated_at) VALUES ($1, $2, 'EMP-HEAD', 'Head Person', 'head@corp.test', 'STAFF'::"EmploymentType", now()::date, now())`,
        [empId, orgId],
      );
      await sql.query(
        `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, updated_at) VALUES ($1, $2, $3, 'user@acme.test', 'user@acme.test', 'ACTIVE', now())`,
        [userId, orgId, empId],
      );
      await sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, now()::date)`,
        [orgId, empId, deptId],
      );
      await sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, now()::date)`,
        [orgId, deptId, empId],
      );

      // Attempting to grant SUPER_ADMIN to this user who heads a department should fail with check_violation
      await expect(
        sql.query(
          `INSERT INTO role_grants (id, organization_id, app_user_id, role)
         VALUES (gen_random_uuid(), $1, $2, 'SUPER_ADMIN'::"AppRole")`,
          [orgId, userId],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
