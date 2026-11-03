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

  it(
    'drops projects, project_departments and ProjectStatus type while keeping department intact',
    async () => {
      database = await provisionDisposableDatabase();
      sql = new Client({ connectionString: database.url });
      await sql.connect();

      const before = await deployMigrations(database, { through: migrationBefore(MIGRATION) });
      expect(before.code).toBe(0);

      const orgId = randomUUID();
      const deptId = randomUUID();
      const projId = randomUUID();

      await sql.query(
        `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', 'Asia/Ho_Chi_Minh', 'VND')`,
        [orgId],
      );
      await sql.query(
        `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'DEPT-P', 'Product Dept', now())`,
        [deptId, orgId],
      );
      await sql.query(
        `INSERT INTO projects (id, organization_id, name, status) VALUES ($1, $2, 'Special Project', 'RUNNING'::"ProjectStatus")`,
        [projId, orgId],
      );
      await sql.query(`INSERT INTO project_departments (project_id, department_id) VALUES ($1, $2)`, [projId, deptId]);

      const deploy = await deployMigrations(database, { through: MIGRATION });
      expect(deploy.code).toBe(0);

      // Verify projects table dropped
      const projectsTable = await sql.query<{ tbl: string | null }>(`SELECT to_regclass('public.projects') AS tbl`);
      expect(projectsTable.rows[0].tbl).toBeNull();

      // Verify project_departments table dropped
      const projDeptsTable = await sql.query<{ tbl: string | null }>(
        `SELECT to_regclass('public.project_departments') AS tbl`,
      );
      expect(projDeptsTable.rows[0].tbl).toBeNull();

      // Verify ProjectStatus type dropped
      const statusType = await sql.query<{ typ: string | null }>(`SELECT to_regtype('public."ProjectStatus"') AS typ`);
      expect(statusType.rows[0].typ).toBeNull();

      // Verify department remains intact
      const deptRows = await sql.query<{ id: string; code: string }>(`SELECT id, code FROM departments WHERE id = $1`, [
        deptId,
      ]);
      expect(deptRows.rows).toHaveLength(1);
      expect(deptRows.rows[0].code).toBe('DEPT-P');
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
