import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { expansionWorld, ExpansionWorld, insertSubscriptionAs7c28e75 } from '../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.2a (F02, spec L.3): the live inventory of `ops:preflight` for the
 * owner department of a subscription. Before the expansion migration it only **lists** what will need an owner (the
 * deploy that adds the column may run); after it, every subscription with no owner and no valid assignment — whoever
 * created it, including the previous release recovered by H7 — **blocks**, ids only, recomputed on every run. The
 * command is real (`migration-preflight-cli.ts` through ts-node) on a database whose history Prisma recorded itself.
 */
const OWNER_COLUMN = migrationEndingWith('_subscription_owner_column');

interface Report {
  status: 'READY' | 'BLOCKED';
  history: string;
  blockers: Array<{ code: string; subscriptionId?: string }>;
  information: Array<{ code: string; subscriptionId?: string; organizationId?: string }>;
}

describe('ops:preflight, the owner department of a subscription (integration, real CLI and PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  const old: string[] = [];

  const preflight = async (target: DisposableDatabase = database): Promise<{ code: number | null; report: Report }> => {
    const result = await runCli('migration-preflight-cli.ts', ['--json'], {
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
    'before the expansion migration: ready, with every subscription listed as a row to assign, ids sorted and nothing else',
    async () => {
      const before = await deployMigrations(database, { through: migrationBefore(OWNER_COLUMN) });
      if (before.code !== 0) throw new Error(`Deploying the history before (A) failed: ${before.stdout}`);
      world = await expansionWorld(sql);
      old.push(await insertSubscriptionAs7c28e75(sql, world), await insertSubscriptionAs7c28e75(sql, world));

      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(report.status).toBe('READY');
      expect(report.blockers).toEqual([]);
      expect(report.information).toEqual(
        [...old].sort().map((subscriptionId) => ({ code: 'SUBSCRIPTION_OWNER_TO_ASSIGN', subscriptionId })),
      );
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'after it: every subscription with no owner department and no assignment blocks, including one the previous release made late',
    async () => {
      const deploy = await deployMigrations(database);
      if (deploy.code !== 0) throw new Error(`Deploying (A) failed: ${deploy.stdout}`);
      const late = await insertSubscriptionAs7c28e75(sql, world);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.status).toBe('BLOCKED');
      // The only thing listed is the Cost Center link of this installation, which the operator has not activated yet (F01).
      expect(report.information).toEqual([
        { code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: world.organizationId },
      ]);
      expect(report.blockers).toEqual(
        [...old, late].sort().map((subscriptionId) => ({ code: 'SUBSCRIPTION_OWNER_UNASSIGNED', subscriptionId })),
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
    },
    CLI_COLD_START_MS,
  );

  it(
    'one of the two objects without the other cannot be trusted either way: blocked',
    async () => {
      await sql.query(`ALTER TABLE subscriptions DROP COLUMN owner_department_id`);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.blockers).toEqual([{ code: 'SUBSCRIPTION_OWNER_SCHEMA_PARTIAL' }]);
    },
    CLI_COLD_START_MS,
  );
});
