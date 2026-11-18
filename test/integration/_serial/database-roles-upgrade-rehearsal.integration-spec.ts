import { join } from 'node:path';
import request from 'supertest';
import { foreignOwnedObjects } from '../../../src/infrastructure/database/roles/database-role-catalog';
import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
  verifyDatabaseRoles,
} from '../../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../../src/infrastructure/database/roles/database-role-settings';
import { bodyOf } from '../../support/api-body';
import {
  CLI_COLD_START_MS,
  PROJECT_ROOT,
  cliWorkingDirectory,
  runCli,
  runScript,
  stopCliProcesses,
} from '../../support/cli-process';
import { migrateDisposableDatabase } from '../../support/disposable-database';
import {
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';
import {
  RoleSeparatedDatabase,
  allowDeployToReadMarker,
  createRoleSeparatedDatabase,
  dropRoleSeparatedDatabase,
  tableFingerprints,
  withClient,
} from '../../support/role-separated-database';

/**
 * H7 on an installation that already has data, as production has it before H7: migrated and used by the cluster
 * superuser. `provision` moves it to the role matrix without changing a row or the migration history, the new deploy path
 * (preflight, migrate, reconcile) runs as the deploy role, the API serves the same data as the runtime role, missing or
 * wrong credentials reach nothing, and the change rolls back by configuration alone. PostgreSQL 17.
 */
describe('moving an existing installation to the role matrix (integration, PostgreSQL)', () => {
  let database: RoleSeparatedDatabase;
  let seed: SeededInstallation;
  let fingerprints: Record<string, string>;
  /** The application as the old wiring ran it: the superuser. */
  const app = (url: () => string) => createHttpTestApp({ database: database.bootstrapHandle, appDatabaseUrl: url });
  const signIn = async (url: () => string): Promise<number> => {
    const ctx = await app(url);
    try {
      return (
        await request(ctx.app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      ).status;
    } finally {
      await ctx.close();
    }
  };
  /**
   * `prisma migrate deploy` as a child process with exactly this environment. It runs from an empty working directory with
   * the repository's config named explicitly, and DOTENV_CONFIG_PATH names no file: no `.env` can supply a database, so
   * a missing DATABASE_URL can never reach the developer's (H7-VRF-01).
   */
  const prismaDeploy = (environment: Record<string, string>) =>
    runScript(
      'node_modules/prisma/build/index.js',
      ['migrate', 'deploy', '--config', join(PROJECT_ROOT, 'prisma.config.ts')],
      {
        cwd: cliWorkingDirectory('slm-h7-prisma'),
        environment: { CHECKPOINT_DISABLE: '1', DOTENV_CONFIG_PATH: 'h7-no-such-env-file', ...environment },
      },
    );
  const preflight = (environment: Record<string, string>) =>
    runCli('preflight', [], { cwd: cliWorkingDirectory('slm-h7-preflight'), environment });

  beforeAll(async () => {
    database = await createRoleSeparatedDatabase();
    await migrateDisposableDatabase(database.bootstrapHandle);
    const ctx = await app(() => database.bootstrapUrl);
    try {
      seed = await seedInstallation(ctx.app);
      const login = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: seed.superAdmin.email, password: SEED_PASSWORD });
      const { employeeId } = await insertEmployeeFixture(ctx.app, seed, { code: 'E-OLD', email: 'old.wiring@acme.vn' });
      await request(ctx.app.getHttpServer())
        .post('/api/v1/app-users')
        .set({ Authorization: `Bearer ${bodyOf(login).data.accessToken}` })
        .send({ employeeId, role: 'EMPLOYEE' })
        .expect(201);
    } finally {
      await ctx.close();
    }
    fingerprints = await tableFingerprints(database);
  }, 180000);

  afterAll(async () => {
    stopCliProcesses();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('provisions the installation without changing a row or the migration history', async () => {
    const report = await withClient(database.bootstrapUrl, (client) =>
      provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
    );

    expect(report).toMatchObject({ outcome: 'DONE', databaseOwnerChanged: true, findings: [] });
    expect(report.transferredObjects).toBeGreaterThan(100);
    expect(
      await withClient(database.bootstrapUrl, (client) => foreignOwnedObjects(client, database.deploy.role)),
    ).toEqual([]);
    expect(await tableFingerprints(database)).toEqual(fingerprints);
    expect(Number(fingerprints.app_users.split(':')[0])).toBe(2);
  });

  it(
    'runs the new deploy path as the deploy role: preflight READY, nothing to migrate, reconcile and verify',
    async () => {
      await allowDeployToReadMarker(database);
      const checked = await preflight({ NODE_ENV: 'production', DATABASE_URL: database.deploy.url });
      await migrateDisposableDatabase(database.deployHandle);
      const reconciled = await withClient(database.deploy.url, (client) =>
        reconcileDatabaseRoles(client, database.runtime.role),
      );

      expect({ code: checked.code, stderr: checked.stderr }).toEqual({ code: 0, stderr: '' });
      expect(checked.stdout).toContain('READY');
      expect(reconciled).toMatchObject({ outcome: 'DONE', findings: [] });
      expect(await tableFingerprints(database)).toEqual(fingerprints);
    },
    CLI_COLD_START_MS,
  );

  it('serves the existing data to the API as the runtime role', async () => {
    expect(await signIn(() => database.runtime.url)).toBe(200);
  });

  it(
    'stops preflight and migrate on a missing or wrong deploy credential, with no fallback to another identity',
    async () => {
      const wrong = new URL(database.deploy.url);
      wrong.password = 'not-the-deploy-password';
      const history = async () => (await tableFingerprints(database))._prisma_migrations;
      const before = await history();
      // node-postgres and libpq would read these when the URL leaves something out: they name the superuser here.
      const superuserFallback = {
        PGHOST: '127.0.0.1',
        PGPORT: new URL(database.bootstrapUrl).port,
        PGUSER: database.bootstrapRole,
        PGPASSWORD: decodeURIComponent(new URL(database.bootstrapUrl).password),
        PGDATABASE: database.name,
      };

      const preflightWrong = await preflight({ NODE_ENV: 'production', DATABASE_URL: wrong.toString() });
      const preflightMissing = await preflight({ NODE_ENV: 'production', ...superuserFallback });
      const migrateWrong = await prismaDeploy({ NODE_ENV: 'production', DATABASE_URL: wrong.toString() });
      const migrateMissing = await prismaDeploy({ NODE_ENV: 'production', ...superuserFallback });

      expect(preflightWrong.code).toBe(1);
      expect(preflightMissing.code).toBe(1);
      expect(preflightMissing.stderr).toContain('DATABASE_URL');
      expect(migrateWrong.code).not.toBe(0);
      expect(migrateWrong.stdout + migrateWrong.stderr).toMatch(/P1000|[Aa]uthentication failed/);
      expect(migrateMissing.code).not.toBe(0);
      expect(migrateMissing.stdout + migrateMissing.stderr).toContain('DATABASE_URL');
      // It never reached a database: no line about a migration history.
      expect(migrateMissing.stdout + migrateMissing.stderr).not.toMatch(
        /migrations? found|No pending|Applying migration|applied/i,
      );
      for (const result of [preflightWrong, preflightMissing, migrateWrong, migrateMissing]) {
        expect(result.stdout + result.stderr).not.toContain('not-the-deploy-password');
        expect(result.stdout + result.stderr).not.toContain(superuserFallback.PGPASSWORD);
      }
      expect(await history()).toBe(before);
    },
    4 * CLI_COLD_START_MS,
  );

  it('rolls back by configuration alone, and the roles can be removed and provisioned again', async () => {
    // The old image and Compose: the superuser migrates (nothing pending) and serves; no migration is undone.
    await migrateDisposableDatabase(database.bootstrapHandle);
    expect(await signIn(() => database.bootstrapUrl)).toBe(200);

    // Optional full removal (runbook): give everything back to the superuser, then drop both roles.
    await withClient(database.bootstrapUrl, async (client) => {
      await client.query(`REASSIGN OWNED BY "${database.deploy.role}" TO "${database.bootstrapRole}"`);
      // One role per statement, the runtime role first: one `DROP OWNED BY deploy, runtime` meets the deploy role's
      // default ACL for the runtime role twice and fails ("could not find tuple for default ACL", PostgreSQL 17).
      await client.query(`DROP OWNED BY "${database.runtime.role}"`);
      await client.query(`DROP OWNED BY "${database.deploy.role}"`);
      await client.query(`DROP ROLE "${database.runtime.role}", "${database.deploy.role}"`);
    });
    const owners = await withClient(database.bootstrapUrl, async (client) =>
      (
        await client.query<{ owner: string }>(
          `SELECT DISTINCT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relnamespace = 'public'::regnamespace
           UNION SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()`,
        )
      ).rows.map((row) => row.owner),
    );
    expect(owners).toEqual([database.bootstrapRole]);
    expect(await signIn(() => database.bootstrapUrl)).toBe(200);

    const again = await withClient(database.bootstrapUrl, (client) =>
      provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
    );
    expect(again).toMatchObject({ outcome: 'DONE', createdRoles: [database.deploy.role, database.runtime.role] });
    expect(
      await withClient(database.deploy.url, (client) => verifyDatabaseRoles(client, database.runtime.role)),
    ).toMatchObject({
      outcome: 'CONSISTENT',
    });
    // Signing in adds sessions, tokens, throttle and audit rows; nothing else moved, and the history is the same.
    const SIGN_IN_WRITES = ['auth_sessions', 'refresh_tokens', 'login_throttles', 'audit_events'];
    const unmoved = (all: Record<string, string>) =>
      Object.fromEntries(Object.entries(all).filter(([table]) => !SIGN_IN_WRITES.includes(table)));
    const now = await tableFingerprints(database);

    expect(now._prisma_migrations).toBe(fingerprints._prisma_migrations);
    expect(unmoved(now)).toEqual(unmoved(fingerprints));
  });
});
