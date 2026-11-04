import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
} from '../../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../../src/infrastructure/database/roles/database-role-settings';
import { CURRENT_INSTALLATION_RECORDS } from '../../../src/modules/installation/inspect/inspection-facts.policy';
import { INSTALLATION } from '../../../src/cli/seed/fixture/shared-demo-v2/installation';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../../support/cli-process';
import { migrateDisposableDatabase } from '../../support/disposable-database';
import { addDepartment, addPerson, rolesWorld } from '../../support/direct-roles-world';
import {
  allowDeployToReadMarker,
  createRoleSeparatedDatabase,
  dropRoleSeparatedDatabase,
  sqlStateOf,
  withClient,
  type RoleSeparatedDatabase,
} from '../../support/role-separated-database';

describe('seed check with production runtime privileges (integration, PostgreSQL)', () => {
  let database: RoleSeparatedDatabase;
  let cwd: string;
  const check = () =>
    runCli('seed', ['check', '--environment', 'SHARED'], {
      cwd,
      environment: { NODE_ENV: 'production', DATABASE_URL: database.runtime.url },
    });

  beforeAll(async () => {
    cwd = cliWorkingDirectory('slm-seed-check');
    database = await createRoleSeparatedDatabase();
    await withClient(database.bootstrapUrl, (client) =>
      provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
    );
  }, 120000);

  afterAll(async () => {
    stopCliProcesses();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it(
    'reports NOT_MIGRATED then EMPTY without privileges on migration metadata',
    async () => {
      expect(await check()).toMatchObject({
        code: 3,
        stdout: expect.stringContaining('STATE\tNOT_MIGRATED\n') as unknown,
      });
      await allowDeployToReadMarker(database);
      await migrateDisposableDatabase(database.deployHandle);
      await withClient(database.deploy.url, (client) => reconcileDatabaseRoles(client, database.runtime.role));
      expect(await sqlStateOf(database.runtime.url, 'SELECT * FROM _prisma_migrations')).toBe('42501');
      expect(await check()).toMatchObject({ code: 0, stdout: expect.stringContaining('STATE\tEMPTY\n') as unknown });
    },
    CLI_COLD_START_MS * 3,
  );

  it(
    'reports installed and incomplete snapshots read-only, including the bootstrap environment',
    async () => {
      await withClient(database.bootstrapUrl, async (sql) => {
        const world = await rolesWorld(sql);
        await sql.query('UPDATE organizations SET name = $1', [INSTALLATION.organizationName]);
        await addDepartment(sql, world, 'ROOT');
        const person = await addPerson(sql, world, { code: 'ADMIN', department: 'ROOT', account: 'ACTIVE' });
        await sql.query(
          `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, 'SUPER_ADMIN')`,
          [world.organizationId, person.appUserId],
        );
        for (const [action, count] of Object.entries(CURRENT_INSTALLATION_RECORDS)) {
          for (let i = 0; i < count; i++)
            await sql.query(
              `INSERT INTO audit_events (id, organization_id, actor_kind, actor_roles, action, resource_type, resource_id, "after", correlation_id)
          VALUES (gen_random_uuid(), $1, 'SYSTEM', '{}', $2, 'Organization', $1, '{"environment":"SHARED"}', gen_random_uuid())`,
              [world.organizationId, action],
            );
        }
      });
      const before = await withClient(database.bootstrapUrl, (sql) =>
        sql.query('SELECT count(*)::int AS n FROM audit_events'),
      );
      const result = await check();
      expect(result.code).toBe(2);
      expect(result.stdout).toContain('STATE\tINSTALLED\n');
      expect(result.stdout).toContain('FIXTURE_ORGANIZATION\tyes\nENVIRONMENT\tSHARED\n');
      expect(result.stdout).toContain('COUNTS\tdepartments=1\taccounts=1\nSECRETS\tnot-checked\n');
      expect(
        (await withClient(database.bootstrapUrl, (sql) => sql.query('SELECT count(*)::int AS n FROM audit_events')))
          .rows,
      ).toEqual(before.rows);
      await withClient(database.bootstrapUrl, (sql) => sql.query("UPDATE app_users SET status = 'LOCKED'"));
      expect((await check()).stdout).toContain('STATE\tINCOMPLETE\n');
    },
    CLI_COLD_START_MS * 2,
  );
});
