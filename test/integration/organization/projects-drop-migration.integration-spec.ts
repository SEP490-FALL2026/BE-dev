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

const MIGRATION = migrationEndingWith('_organization_drop_projects');

describe('drop projects migration (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;

  afterEach(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  async function seedDepartment(): Promise<{ orgId: string; deptId: string }> {
    const orgId = randomUUID();
    const deptId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', 'Asia/Ho_Chi_Minh', 'VND')`,
      [orgId],
    );
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'DEPT-P', 'Product Dept', now())`,
      [deptId, orgId],
    );

    return { orgId, deptId };
  }

  async function startFromBefore(): Promise<void> {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: migrationBefore(MIGRATION) });
    expect(before.code).toBe(0);
  }

  it(
    'drops projects, project_departments and ProjectStatus type when both are empty, keeping the department intact',
    async () => {
      await startFromBefore();
      const { deptId } = await seedDepartment();

      const deploy = await deployMigrations(database, { through: MIGRATION });
      expect(deploy.code).toBe(0);

      const projectsTable = await sql.query<{ tbl: string | null }>(`SELECT to_regclass('public.projects') AS tbl`);
      expect(projectsTable.rows[0].tbl).toBeNull();
      const projDeptsTable = await sql.query<{ tbl: string | null }>(
        `SELECT to_regclass('public.project_departments') AS tbl`,
      );
      expect(projDeptsTable.rows[0].tbl).toBeNull();
      const statusType = await sql.query<{ typ: string | null }>(`SELECT to_regtype('public."ProjectStatus"') AS typ`);
      expect(statusType.rows[0].typ).toBeNull();
      const deptRows = await sql.query<{ id: string; code: string }>(`SELECT id, code FROM departments WHERE id = $1`, [
        deptId,
      ]);
      expect(deptRows.rows).toHaveLength(1);
      expect(deptRows.rows[0].code).toBe('DEPT-P');
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it.each([
    ['a project with a department link', true],
    ['a project with no department', false],
  ])(
    'stops with P0001 and drops nothing while there is %s',
    async (_label, linked) => {
      await startFromBefore();
      const { orgId, deptId } = await seedDepartment();
      const projId = randomUUID();
      await sql.query(
        `INSERT INTO projects (id, organization_id, name, status) VALUES ($1, $2, 'Special Project', 'RUNNING'::"ProjectStatus")`,
        [projId, orgId],
      );
      if (linked) {
        await sql.query(`INSERT INTO project_departments (project_id, department_id) VALUES ($1, $2)`, [
          projId,
          deptId,
        ]);
      }

      const attempt = await deployMigrations(database, { through: MIGRATION });

      expect(attempt.code).not.toBe(0);
      const output = attempt.stderr + attempt.stdout;
      expect(output).toContain('P0001');
      expect(output).toContain('Cannot drop projects: rows remain in projects or project_departments');
      const tables = await sql.query<{ projects: string | null; links: string | null }>(
        `SELECT to_regclass('public.projects') AS projects, to_regclass('public.project_departments') AS links`,
      );
      expect(tables.rows[0]).toEqual({ projects: 'projects', links: 'project_departments' });
      const rows = await sql.query(`SELECT 1 FROM projects WHERE id = $1`, [projId]);
      expect(rows.rowCount).toBe(1);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
