import { relative } from 'node:path';
import { Readable } from 'node:stream';
import type { AddressInfo, Server } from 'node:net';
import { prepareRoleDatabase, sessionRoleOf } from '../../support/role-database-prepare';
import { createHttpTestApp, SEED_PASSWORD, type HttpTestApp } from '../../support/http-test-app';
import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
} from '../../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../../src/infrastructure/database/roles/database-role-settings';
import { CURRENT_INSTALLATION_RECORDS } from '../../../src/modules/installation/inspect/inspection-facts.policy';
import { INSTALLATION } from '../../../src/cli/seed/fixture/shared-demo-v2/installation';
import {
  CLI_COLD_START_MS,
  cliWorkingDirectory,
  runCli,
  runScript,
  PROJECT_ROOT,
  stopCliProcesses,
} from '../../support/cli-process';
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

/** This same test file is the owned child entry, avoiding a separate untracked fixture or a second process helper. */
async function productionApplyDriver(apiUrl: string): Promise<void> {
  const record = `SUPER_ADMIN_PASSWORD=${SEED_PASSWORD}\nDEMO_ACCOUNT_PASSWORD=a long runtime demo password\n`;
  Object.defineProperty(process, 'stdin', { value: Readable.from([Buffer.from(record)]) });
  const { seedCommand } = await import('../../../src/cli/seed/seed.command');
  process.exitCode = await seedCommand.run([
    'apply',
    '--environment',
    'SHARED',
    '--allow-bootstrap',
    '--api-url',
    apiUrl,
    '--operator-reference',
    'TEST-RUNTIME',
    '--secrets-stdin',
  ]);
}

if (process.argv[2] === '--runtime-seed-driver') {
  void productionApplyDriver(process.argv[3]);
} else {
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
          VALUES (gen_random_uuid(), $1::uuid, 'SYSTEM', '{}', $2, 'Organization', $1::text, '{"environment":"SHARED"}', gen_random_uuid())`,
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

  describe('seed apply with production runtime privileges (integration, PostgreSQL)', () => {
    let database: RoleSeparatedDatabase;
    let ctx: HttpTestApp;
    let cwd: string;
    let apiUrl: string;
    beforeAll(async () => {
      cwd = cliWorkingDirectory('slm-seed-apply-runtime');
      database = await prepareRoleDatabase();
      ctx = await createHttpTestApp({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
      apiUrl = `http://127.0.0.1:${((ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;
    }, 300000);
    afterAll(async () => {
      stopCliProcesses();
      await ctx?.close();
      if (database) await dropRoleSeparatedDatabase(database);
    });
    it('bootstraps and applies as the runtime role without migration-history privileges, then reruns unchanged', async () => {
      expect(await sessionRoleOf(ctx.app)).toBe(database.runtime.role);
      expect(await sqlStateOf(database.runtime.url, 'SELECT * FROM _prisma_migrations')).toBe('42501');
      const invoke = () =>
        runScript(relative(PROJECT_ROOT, __filename), ['--runtime-seed-driver', apiUrl], {
          cwd,
          environment: { NODE_ENV: 'production', DATABASE_URL: database.runtime.url },
          timeoutMs: 600000,
        });
      const first = await invoke();
      expect(first.code).toBe(0);
      expect(first.stderr).not.toContain('permission denied');
      expect(
        (
          await ctx.sql.query(
            'SELECT u.id FROM app_users u LEFT JOIN role_grants g ON g.app_user_id = u.id AND g.revoked_at IS NULL GROUP BY u.id HAVING count(g.id) <> 1',
          )
        ).rowCount,
      ).toBe(0);
      expect((await invoke()).code).toBe(2);
    }, 1200000);
  });
}
