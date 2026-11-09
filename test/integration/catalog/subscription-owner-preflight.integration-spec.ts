import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../../support/cli-process';
import { activateCostCenterLink, lastCompatibilityMigration } from '../../support/compat-release';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { expansionWorld, ExpansionWorld, insertSubscriptionAs7c28e75 } from '../../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.2a and 1.2c (F02, spec L.3): the live inventory of `ops:preflight` for the
 * owner department of a subscription, as the FINAL release reads it. A database that skipped the expansion and holds a
 * subscription is blocked (`SUBSCRIPTION_OWNER_EXPANSION_REQUIRED`); on the compatibility schema every subscription with no owner
 * and no valid assignment — whoever created it, including the previous release recovered by H7 — blocks
 * (`SUBSCRIPTION_OWNER_UNASSIGNED`), ids only, recomputed on every run; an empty database and a fully migrated one are ready with
 * nothing listed. The command is real (`src/cli.ts preflight` through ts-node) on a database whose history Prisma recorded
 * itself.
 */
const OWNER_COLUMN = migrationEndingWith('_subscription_owner_column');

interface Report {
  status: 'READY' | 'BLOCKED';
  history: string;
  blockers: Array<{ code: string; subscriptionId?: string; organizationId?: string }>;
  information: Array<{ code: string; subscriptionId?: string; organizationId?: string }>;
}

describe('ops:preflight, the owner department of a subscription (integration, real CLI and PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  const old: string[] = [];

  const preflight = async (target: DisposableDatabase = database): Promise<{ code: number | null; report: Report }> => {
    const result = await runCli('preflight', ['--json'], {
      cwd: cliWorkingDirectory('slm-preflight'),
      environment: { NODE_ENV: 'production', DATABASE_URL: target.url },
    });
    if (result.code !== 0 && result.code !== 2) throw new Error(`preflight ${result.code}: ${result.stderr}`);

    return { code: result.code, report: JSON.parse(result.stdout) as Report };
  };
  const assign = (subscriptionId: string, departmentId: string = world.departments.eng) =>
    sql.query(
      `INSERT INTO subscription_owner_assignments
         (id, organization_id, subscription_id, department_id, basis_reference, operator_ref, environment)
       VALUES ($1, $2, $3, $4, 'PO-2026-0042', 'ops-1', 'LOCAL_TEST')`,
      [randomUUID(), world.organizationId, subscriptionId, departmentId],
    );
  const sorted = (ids: string[]) => [...ids].sort();

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it(
    'an empty database has no subscriptions table: ready, nothing to list',
    async () => {
      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(report).toMatchObject({ status: 'READY', history: 'NOT_INSTALLED', blockers: [], information: [] });
    },
    CLI_COLD_START_MS,
  );

  it(
    'before the expansion migration with nothing in it (a new database): ready, nothing to list',
    async () => {
      const before = await deployMigrations(database, { through: migrationBefore(OWNER_COLUMN) });
      if (before.code !== 0) throw new Error(`Deploying the history before (A) failed: ${before.stdout}`);

      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(report).toMatchObject({ status: 'READY', blockers: [], information: [] });
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'before the expansion migration with subscriptions: BLOCKED, one row per subscription, ids sorted and nothing else (the organization has no link either)',
    async () => {
      world = await expansionWorld(sql);
      old.push(await insertSubscriptionAs7c28e75(sql, world), await insertSubscriptionAs7c28e75(sql, world));

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.status).toBe('BLOCKED');
      expect(report.information).toEqual([]);
      expect(report.blockers).toEqual([
        { code: 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED', organizationId: world.organizationId },
        ...sorted(old).map((subscriptionId) => ({ code: 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED', subscriptionId })),
      ]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'on the compatibility schema: every subscription with no owner department and no assignment blocks, including one the previous release made late',
    async () => {
      const deploy = await deployMigrations(database, { through: lastCompatibilityMigration() });
      if (deploy.code !== 0) throw new Error(`Deploying the compatibility release failed: ${deploy.stdout}`);
      // The Cost Center link is the operator's other step; it is done here so that this suite reads the subscriptions only.
      await activateCostCenterLink(sql, world.organizationId);
      const late = await insertSubscriptionAs7c28e75(sql, world);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.status).toBe('BLOCKED');
      expect(report.information).toEqual([]);
      expect(report.blockers).toEqual(
        sorted([...old, late]).map((subscriptionId) => ({ code: 'SUBSCRIPTION_OWNER_UNASSIGNED', subscriptionId })),
      );
      old.push(late);
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'a valid assignment closes its subscription, and so does an owner department set with no assignment: nothing open is ready',
    async () => {
      for (const subscriptionId of old) await assign(subscriptionId);
      const owned = await insertSubscriptionAs7c28e75(sql, world);
      await sql.query(`UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [
        owned,
        world.departments.ops,
      ]);

      const { code, report } = await preflight();

      expect(report.blockers).toEqual([]);
      expect({ code, status: report.status }).toEqual({ code: 0, status: 'READY' });
    },
    CLI_COLD_START_MS,
  );

  it(
    'an assignment the owner department contradicts is not valid: the subscription blocks (one organization per installation, ADR-01)',
    async () => {
      // Assigned to ENG, then given OPS as its owner department: the record of the basis contradicts the owner.
      const contradicted = await insertSubscriptionAs7c28e75(sql, world);
      await assign(contradicted, world.departments.eng);
      await sql.query(`UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [
        contradicted,
        world.departments.ops,
      ]);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.blockers).toEqual([{ code: 'SUBSCRIPTION_OWNER_UNASSIGNED', subscriptionId: contradicted }]);

      // The contradiction is the operator's to resolve; here the owner is cleared so the assignment is the only record again.
      await sql.query(`UPDATE subscriptions SET owner_department_id = NULL WHERE id = $1`, [contradicted]);
      expect((await preflight()).report.blockers).toEqual([]);
    },
    CLI_COLD_START_MS * 2,
  );

  it(
    'after the migrations of the final release the column is nullable (shared pool): nothing is open, nothing is listed, the history is converged',
    async () => {
      const deploy = await deployMigrations(database);
      if (deploy.code !== 0) throw new Error(`Deploying the final release failed: ${deploy.stdout}\n${deploy.stderr}`);

      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(report).toMatchObject({ status: 'READY', history: 'CONVERGED', blockers: [], information: [] });
      const column = await sql.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'owner_department_id'`,
      );
      // Rewritten for QĐ-103d: `shared_pool_grant` made the column nullable (a pool no department owns); W5 drops it.
      expect(column.rows).toEqual([{ is_nullable: 'YES' }]);
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'one of the two objects without the other cannot be trusted either way: blocked',
    async () => {
      await sql.query(`DROP TABLE subscription_owner_assignments CASCADE`);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.blockers).toEqual([{ code: 'SUBSCRIPTION_OWNER_SCHEMA_PARTIAL' }]);
    },
    CLI_COLD_START_MS,
  );
});
