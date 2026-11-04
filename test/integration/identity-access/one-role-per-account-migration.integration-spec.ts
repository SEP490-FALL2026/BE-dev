import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT, stopCliProcesses } from '../../support/cli-process';
import {
  dropDisposableDatabase,
  provisionDisposableDatabase,
  type DisposableDatabase,
} from '../../support/disposable-database';
import { addDepartment, addPerson, rolesWorld } from '../../support/direct-roles-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const MIGRATION = migrationEndingWith('_identity_one_role_per_account');
const text = readFileSync(join(PROJECT_ROOT, 'prisma/migrations', MIGRATION, 'migration.sql'), 'utf8');
const guard = text.slice(text.indexOf('DO $$'), text.indexOf('END $$;') + 'END $$;'.length);

describe('one role per account migration (integration, PostgreSQL)', () => {
  const opened: Array<{ database: DisposableDatabase; sql: Client }> = [];
  const open = async () => {
    const database = await provisionDisposableDatabase();
    const sql = new Client({ connectionString: database.url });
    await sql.connect();
    opened.push({ database, sql });
    const before = await deployMigrations(database, { through: migrationBefore(MIGRATION) });
    if (before.code !== 0) throw new Error(before.stdout + before.stderr);

    return { database, sql };
  };

  afterAll(async () => {
    stopCliProcesses();
    for (const { database, sql } of opened) {
      await sql.end();
      await dropDisposableDatabase(database);
    }
  });

  it(
    'lists zero and multiple effective roles, changes nothing, and refuses a real deploy',
    async () => {
      const { database, sql } = await open();
      const world = await rolesWorld(sql);
      await addDepartment(sql, world, 'MIG');
      const empty = await addPerson(sql, world, { code: 'NO-GRANT', department: 'MIG', account: 'ACTIVE' });
      const multiple = await addPerson(sql, world, { code: 'TWO-GRANTS', department: 'MIG', account: 'ACTIVE' });
      await sql.query(
        `INSERT INTO role_grants (id, organization_id, app_user_id, role)
      VALUES (gen_random_uuid(), $1, $2, 'EMPLOYEE'), (gen_random_uuid(), $1, $2, 'IT_ADMIN')`,
        [world.organizationId, multiple.appUserId],
      );
      const before = (await sql.query('SELECT * FROM role_grants ORDER BY id')).rows as unknown[];
      await sql.query('BEGIN');
      await expect(sql.query(guard)).rejects.toMatchObject({
        code: 'P0001',
        message: expect.stringContaining('NO_ROLE NO-GRANT') as unknown,
      });
      await sql.query('ROLLBACK');
      expect((await sql.query('SELECT * FROM role_grants ORDER BY id')).rows).toEqual(before);
      expect(empty.appUserId).toBeTruthy();

      const deployed = await deployMigrations(database, { through: MIGRATION });
      expect(deployed.code).not.toBe(0);
      expect(deployed.stdout + deployed.stderr).toContain('P0001');
      expect(deployed.stdout + deployed.stderr).toContain('MULTIPLE_ROLES TWO-GRANTS EMPLOYEE,IT_ADMIN');
      expect(deployed.stdout + deployed.stderr).toContain('NO_ROLE NO-GRANT');
      expect((await sql.query('SELECT * FROM role_grants ORDER BY id')).rows).toEqual(before);
      expect((await sql.query("SELECT to_regclass('role_grants_one_role_per_account') AS idx")).rows[0]).toEqual({
        idx: null,
      });
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it(
    'applies on an empty database, keeps the singleton and head guards, and enforces one effective role',
    async () => {
      const { database, sql } = await open();
      expect((await deployMigrations(database, { through: MIGRATION })).code).toBe(0);
      const objects = await sql.query<{
        name: string;
      }>(`SELECT indexname AS name FROM pg_indexes WHERE tablename = 'role_grants'
      UNION ALL SELECT tgname AS name FROM pg_trigger WHERE tgrelid = 'role_grants'::regclass AND NOT tgisinternal`);
      const names = objects.rows.map((row) => row.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'role_grants_one_role_per_account',
          'role_grants_one_super_admin',
          'role_grants_one_finance',
          'role_grants_one_spending_approver',
          'role_grants_super_admin_exclusions',
          'role_grants_manager_revoke_guard',
          'role_grants_spending_approver_not_head',
        ]),
      );
      expect(names).not.toContain('role_grants_one_effective_per_role');
      expect(names).not.toContain('role_grants_forbid_combination');
      expect((await sql.query("SELECT to_regproc('role_grants_forbid_combination') AS fn")).rows[0]).toEqual({
        fn: null,
      });
      const world = await rolesWorld(sql);
      await addDepartment(sql, world, 'VALID');
      const person = await addPerson(sql, world, { code: 'ONE', department: 'VALID', account: 'ACTIVE' });
      await sql.query(
        `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, 'EMPLOYEE')`,
        [world.organizationId, person.appUserId],
      );
      await expect(
        sql.query(
          `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, 'IT_ADMIN')`,
          [world.organizationId, person.appUserId],
        ),
      ).rejects.toMatchObject({ code: '23505', constraint: 'role_grants_one_role_per_account' });
      await sql.query(`UPDATE role_grants SET revoked_at = GREATEST(now(), granted_at) WHERE app_user_id = $1`, [
        person.appUserId,
      ]);
      await sql.query(
        `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, 'IT_ADMIN')`,
        [world.organizationId, person.appUserId],
      );
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
