import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readSeparationFacts } from '../../../src/infrastructure/database/roles/database-role-catalog';
import { judgeSeparation } from '../../../src/infrastructure/database/database-role-judgement';
import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
} from '../../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../../src/infrastructure/database/roles/database-role-settings';
import {
  CLI_COLD_START_MS,
  PROJECT_ROOT,
  cliWorkingDirectory,
  runCli,
  stopCliProcesses,
} from '../../support/cli-process';
import { migrateDisposableDatabase } from '../../support/disposable-database';
import {
  RoleSeparatedDatabase,
  allowDeployToReadMarker,
  createRoleSeparatedDatabase,
  dropRoleSeparatedDatabase,
  privilegeSnapshot,
  withClient,
} from '../../support/role-separated-database';

/**
 * H7 (F-15, DB-04, Q9) on a fresh installation: `ops:db-roles provision` as the cluster superuser, every committed
 * migration as the deploy role, `reconcile` after it; the catalog shows the role matrix of the spec, and a second run
 * changes nothing. PostgreSQL 17, a dedicated server (TEST_DATABASE_BOOTSTRAP_URL).
 */
describe('ops:db-roles on a fresh installation (integration, PostgreSQL)', () => {
  let database: RoleSeparatedDatabase;
  const secrets = (): string[] => [database.deploy.password, database.runtime.password, 'postgresql://'];
  const command = (args: string[], environment: Record<string, string>) =>
    runCli('db-roles', args, { cwd: cliWorkingDirectory('slm-h7-roles'), environment });

  beforeAll(async () => {
    database = await createRoleSeparatedDatabase();
  });

  afterAll(async () => {
    stopCliProcesses();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it(
    'provisions both roles through the command and prints no URL and no password',
    async () => {
      const result = await command(['provision'], database.provisionEnvironment);

      expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: '' });
      expect(result.stdout).toContain('ops:db-roles provision: DONE');
      expect(result.stdout).toContain(`deploy role:          ${database.deploy.role} (created)`);
      expect(result.stdout).toContain(`runtime role:         ${database.runtime.role} (created)`);
      for (const secret of [...secrets(), database.bootstrapUrl]) expect(result.stdout).not.toContain(secret);
    },
    CLI_COLD_START_MS,
  );

  it('gives both roles the attributes of the matrix, no membership, and the database to the deploy role', async () => {
    const roles = await withClient(database.bootstrapUrl, async (client) => {
      const { rows } = await client.query(
        `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin, rolinherit,
                (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid OR m.roleid = r.oid) AS memberships,
                (SELECT count(*)::int FROM pg_db_role_setting s WHERE s.setrole = r.oid) AS settings,
                rolpassword LIKE 'SCRAM-SHA-256$4096:%' AS scram
           FROM pg_authid r WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
        [[database.deploy.role, database.runtime.role]],
      );
      const owner = await client.query<{ owner: string }>(
        `SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1`,
        [database.name],
      );
      return { roles: rows, owner: owner.rows[0].owner };
    });
    const ordinary = {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
      rolcanlogin: true,
      rolinherit: true,
      memberships: 0,
      settings: 0,
      scram: true,
    };

    expect(roles.roles).toEqual([
      { rolname: database.deploy.role, ...ordinary },
      { rolname: database.runtime.role, ...ordinary },
    ]);
    expect(roles.owner).toBe(database.deploy.role);
    // The stored verifier was computed by the command: the plain password still authenticates over SCRAM.
    for (const login of [database.deploy, database.runtime]) {
      await expect(
        withClient(
          login.url,
          async (client) => (await client.query<{ who: string }>('SELECT current_user AS who')).rows[0],
        ),
      ).resolves.toEqual({ who: login.role });
    }
  });

  it('deploys every committed migration as the deploy role, extension and constraints included', async () => {
    await allowDeployToReadMarker(database);
    await migrateDisposableDatabase(database.deployHandle);

    const committed = readdirSync(join(PROJECT_ROOT, 'prisma', 'migrations'), { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    ).length;
    const facts = await withClient(database.deploy.url, async (client) => {
      const one = async (sql: string): Promise<number> => (await client.query<{ value: number }>(sql)).rows[0].value;
      return {
        applied: await one(
          'SELECT count(*)::int AS value FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
        ),
        btreeGist: await one(`SELECT count(*)::int AS value FROM pg_extension WHERE extname = 'btree_gist'`),
        exclusions: await one(`SELECT count(*)::int AS value FROM pg_constraint WHERE contype = 'x'`),
        triggers: await one(`SELECT count(*)::int AS value FROM pg_trigger WHERE NOT tgisinternal`),
        appendOnly: await one(
          `SELECT count(*)::int AS value FROM pg_trigger WHERE tgrelid = 'public.audit_events'::regclass AND NOT tgisinternal`,
        ),
      };
    });

    expect(facts).toMatchObject({ applied: committed, btreeGist: 1, appendOnly: 2 });
    expect(facts.exclusions).toBeGreaterThan(0);
    expect(facts.triggers).toBeGreaterThan(20);
  });

  it(
    'reconciles after the migration; verify then finds the matrix exactly',
    async () => {
      const environment = { DATABASE_URL: database.deploy.url, DATABASE_RUNTIME_ROLE: database.runtime.role };
      // Before reconcile the default privileges gave plain DML to the two tables the migration just created.
      const before = await command(['verify'], environment);
      const reconciled = await command(['reconcile'], environment);
      const verified = await command(['verify', '--json'], environment);

      expect(before.code).toBe(2);
      expect(before.stdout).toContain('RUNTIME_TABLE_PRIVILEGES: _prisma_migrations: expected none');
      expect(before.stdout).toContain('RUNTIME_TABLE_PRIVILEGES: audit_events: expected INSERT, SELECT');
      expect({ code: reconciled.code, stderr: reconciled.stderr }).toEqual({ code: 0, stderr: '' });
      expect(verified.code).toBe(0);
      expect(JSON.parse(verified.stdout)).toMatchObject({ command: 'verify', outcome: 'CONSISTENT', findings: [] });
      for (const output of [before, reconciled, verified]) {
        for (const secret of secrets()) expect(output.stdout + output.stderr).not.toContain(secret);
      }
    },
    3 * CLI_COLD_START_MS,
  );

  it('is idempotent: provision and reconcile again change no owner, ACL, default privilege or attribute', async () => {
    const before = await privilegeSnapshot(database);
    const provisioned = await withClient(database.bootstrapUrl, (client) =>
      provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
    );
    const reconciled = await withClient(database.deploy.url, (client) =>
      reconcileDatabaseRoles(client, database.runtime.role),
    );

    expect(provisioned).toMatchObject({
      outcome: 'DONE',
      createdRoles: [],
      databaseOwnerChanged: false,
      transferredObjects: 0,
    });
    expect(reconciled).toMatchObject({ outcome: 'DONE', findings: [] });
    expect(await privilegeSnapshot(database)).toBe(before);
    await expect(
      withClient(database.deploy.url, async (client) =>
        judgeSeparation(await readSeparationFacts(client, database.deploy.role, database.runtime.role)),
      ),
    ).resolves.toEqual([]);
  });
});
