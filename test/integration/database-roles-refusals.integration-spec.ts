import { Client } from 'pg';
import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
  verifyDatabaseRoles,
} from '../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../src/infrastructure/database/roles/database-role-settings';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../support/cli-process';
import {
  RoleSeparatedDatabase,
  createExtraRole,
  createRoleSeparatedDatabase,
  dropRoleSeparatedDatabase,
  privilegeSnapshot,
  withClient,
} from '../support/role-separated-database';

/**
 * H7: `ops:db-roles` fails closed. A missing, wrong or aliased credential, a bootstrap that is not a superuser, an existing
 * role with privileges, a membership or a setting, and a database the matrix does not describe are refused or reported
 * with nothing written; no secret is ever printed. PostgreSQL 17 (TEST_DATABASE_BOOTSTRAP_URL, TEST_DATABASE_ADMIN_URL).
 */
describe('ops:db-roles refuses what it cannot make safe (integration, PostgreSQL)', () => {
  const databases: RoleSeparatedDatabase[] = [];
  const fresh = async (): Promise<RoleSeparatedDatabase> => {
    const database = await createRoleSeparatedDatabase();
    databases.push(database);
    return database;
  };
  const provision = (database: RoleSeparatedDatabase, environment = database.provisionEnvironment) =>
    withClient(environment.DATABASE_BOOTSTRAP_URL, (client) =>
      provisionDatabaseRoles(client, readProvisionSettings(environment)),
    );
  const rolesNamed = (database: RoleSeparatedDatabase): Promise<string[]> =>
    withClient(database.bootstrapUrl, async (client) =>
      (
        await client.query<{ rolname: string }>(
          'SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY 1',
          [[database.deploy.role, database.runtime.role]],
        )
      ).rows.map((row) => row.rolname),
    );

  afterAll(async () => {
    stopCliProcesses();
    for (const database of databases) await dropRoleSeparatedDatabase(database);
  });

  it(
    'refuses an incomplete or aliased set before connecting, and a wrong bootstrap password at the server, printing no secret',
    async () => {
      const database = await fresh();
      const withoutDeploy = Object.fromEntries(
        Object.entries(database.provisionEnvironment).filter(([name]) => name !== 'DATABASE_DEPLOY_URL'),
      );
      const wrongPassword = new URL(database.bootstrapUrl);
      wrongPassword.password = 'not-the-bootstrap-password';
      const run = (environment: Record<string, string>) =>
        runCli('database-roles-cli.ts', ['provision'], { cwd: cliWorkingDirectory('slm-h7-refuse'), environment });

      const missing = await run(withoutDeploy);
      const aliased = await run({ ...database.provisionEnvironment, DATABASE_RUNTIME_URL: database.bootstrapUrl });
      const unauthenticated = await run({
        ...database.provisionEnvironment,
        DATABASE_BOOTSTRAP_URL: wrongPassword.toString(),
      });

      expect(missing).toMatchObject({ code: 1, stdout: '' });
      expect(missing.stderr).toContain('DATABASE_DEPLOY_URL is required');
      expect(aliased).toMatchObject({ code: 1, stdout: '' });
      expect(unauthenticated).toMatchObject({ code: 1, stdout: '' });
      expect(unauthenticated.stderr).toContain('[28P01]');
      for (const result of [missing, aliased, unauthenticated]) {
        for (const secret of [
          database.deploy.password,
          database.runtime.password,
          'not-the-bootstrap-password',
          '://',
        ]) {
          expect(result.stderr).not.toContain(secret);
        }
      }
      expect(await rolesNamed(database)).toEqual([]);
    },
    3 * CLI_COLD_START_MS,
  );

  it('refuses a bootstrap login that is not a superuser, creating nothing', async () => {
    const database = await fresh();
    const ordinary = new URL(process.env.TEST_DATABASE_ADMIN_URL as string);
    ordinary.pathname = `/${database.name}`;
    // PUBLIC may connect to a database the superuser just created: the ordinary CREATEDB role of the harness can log in.
    const report = await provision(database, {
      ...database.provisionEnvironment,
      DATABASE_BOOTSTRAP_URL: ordinary.toString(),
    });

    expect(report).toMatchObject({ outcome: 'REFUSED', findings: [{ code: 'BOOTSTRAP_NOT_SUPERUSER' }] });
    expect(await rolesNamed(database)).toEqual([]);
  });

  it.each([
    ['an existing superuser', 'LOGIN SUPERUSER', 'RUNTIME_SUPERUSER'],
    ['an existing CREATEROLE role', 'LOGIN CREATEROLE', 'RUNTIME_CREATEROLE'],
    ['an existing role with CREATEDB', 'LOGIN CREATEDB', 'RUNTIME_CREATEDB'],
  ])('does not demote %s named as the runtime role; it refuses and writes nothing', async (_case, attributes, code) => {
    const database = await fresh();
    await createExtraRole(database, database.runtime.role, attributes);
    const before = await privilegeSnapshot(database);

    const report = await provision(database);

    expect(report).toMatchObject({ outcome: 'REFUSED', findings: [{ code }], createdRoles: [] });
    expect(await privilegeSnapshot(database)).toBe(before);
    expect(await rolesNamed(database)).toEqual([database.runtime.role]);
  });

  it('refuses a runtime role that is a member of another role, or carries a role setting', async () => {
    const member = await fresh();
    await createExtraRole(member, member.runtime.role, 'LOGIN IN ROLE pg_read_all_data');
    const configured = await fresh();
    await createExtraRole(configured, configured.runtime.role, 'LOGIN');
    await withClient(configured.bootstrapUrl, (client) =>
      client.query(`ALTER ROLE "${configured.runtime.role}" SET session_replication_role = replica`),
    );

    expect(await provision(member)).toMatchObject({ outcome: 'REFUSED', findings: [{ code: 'RUNTIME_MEMBERSHIP' }] });
    expect(await provision(configured)).toMatchObject({
      outcome: 'REFUSED',
      findings: [{ code: 'RUNTIME_ROLE_SETTINGS' }],
    });
  });

  it('runs reconcile as the deploy role only: the superuser and the runtime role are refused', async () => {
    const database = await fresh();
    expect(await provision(database)).toMatchObject({ outcome: 'DONE' });
    const reconcileAs = (url: string) =>
      withClient(url, (client: Client) => reconcileDatabaseRoles(client, database.runtime.role));

    expect(await reconcileAs(database.bootstrapUrl)).toMatchObject({
      outcome: 'REFUSED',
      findings: [{ code: 'DEPLOY_SUPERUSER' }, { code: 'DEPLOY_NOT_DATABASE_OWNER' }],
    });
    expect(await reconcileAs(database.runtime.url)).toMatchObject({
      outcome: 'REFUSED',
      findings: [{ code: 'DEPLOY_NOT_DATABASE_OWNER' }],
    });
    expect(
      await withClient(database.deploy.url, (client) => reconcileDatabaseRoles(client, 'slm_no_such_runtime')),
    ).toMatchObject({ outcome: 'REFUSED', findings: [{ code: 'RUNTIME_ROLE_MISSING' }] });
  });

  it('reports, and rolls back, a schema the matrix does not describe; provision repairs ownership', async () => {
    const database = await fresh();
    expect(await provision(database)).toMatchObject({ outcome: 'DONE' });
    // Someone migrated as the superuser (the old wiring), and someone added a SECURITY DEFINER routine.
    await withClient(database.bootstrapUrl, (client) =>
      client.query('CREATE TABLE public.h7_superuser_table (id int)'),
    );
    await withClient(database.deploy.url, (client) =>
      client.query(`CREATE FUNCTION public.h7_escalate() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`),
    );
    const before = await privilegeSnapshot(database);

    const reconciled = await withClient(database.deploy.url, (client) =>
      reconcileDatabaseRoles(client, database.runtime.role),
    );

    expect(reconciled.outcome).toBe('INCONSISTENT');
    expect(reconciled.findings).toEqual(
      expect.arrayContaining([
        { code: 'OBJECT_NOT_OWNED_BY_DEPLOY', subject: `table h7_superuser_table (${database.bootstrapRole})` },
        { code: 'SECURITY_DEFINER_ROUTINE', subject: 'h7_escalate()' },
      ]),
    );
    expect(await privilegeSnapshot(database)).toBe(before);

    await withClient(database.deploy.url, (client) => client.query('DROP FUNCTION public.h7_escalate()'));
    expect(await provision(database)).toMatchObject({ outcome: 'DONE', transferredObjects: 1 });
    expect(
      await withClient(database.deploy.url, (client) => verifyDatabaseRoles(client, database.runtime.role)),
    ).toMatchObject({ outcome: 'CONSISTENT', findings: [] });
  });
});
