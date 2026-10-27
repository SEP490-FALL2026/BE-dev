import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { expansionWorld, ExpansionWorld } from '../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.1a (F01, spec L.11): the live inventory of `ops:preflight` for the
 * Cost Center link. Before the compatibility migration it only **lists** the Cost Centers no department names; after it,
 * every Cost Center with no department — whoever created it, including the previous release recovered by H7 or still
 * running in the migrate → recreate window — **blocks**, ids only, recomputed on every run, through partial linking until
 * the last one is linked. The command is real (`migration-preflight-cli.ts` through ts-node) on a database whose history
 * Prisma recorded itself.
 */
const LINK_MIGRATION = migrationEndingWith('_cost_center_department_link');

interface Report {
  status: 'READY' | 'BLOCKED';
  history: string;
  blockers: Array<{ code: string; costCenterId?: string; departmentId?: string }>;
  information: Array<{ code: string; costCenterId?: string; organizationId?: string; subscriptionId?: string }>;
}

describe('ops:preflight, the Cost Center link (integration, real CLI and PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  let counter = 0;

  const preflight = async (): Promise<{ code: number | null; report: Report }> => {
    const result = await runCli('migration-preflight-cli.ts', ['--json'], {
      cwd: cliWorkingDirectory('slm-preflight-cc'),
      environment: { NODE_ENV: 'production', DATABASE_URL: database.url },
    });
    if (result.code !== 0 && result.code !== 2) throw new Error(`preflight ${result.code}: ${result.stderr}`);

    return { code: result.code, report: JSON.parse(result.stdout) as Report };
  };
  const ofCostCenter = (report: Report) => ({
    blockers: report.blockers.filter((blocker) => blocker.code.startsWith('COST_CENTER')),
    information: report.information.filter((item) => item.code.startsWith('COST_CENTER')),
  });
  /** A Cost Center as `7c28e75` writes one around no department: free. */
  const freeCostCenter = async (): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status)
       VALUES ($1, $2, $3, 'Free', 'UNIT', 'ACTIVE')`,
      [id, world.organizationId, `CC-P${counter}`],
    );

    return id;
  };
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
    'an empty database has no Cost Centers table: ready, nothing to list',
    async () => {
      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(report).toMatchObject({ status: 'READY', history: 'NOT_INSTALLED', blockers: [], information: [] });
    },
    CLI_COLD_START_MS,
  );

  let free: string[] = [];

  it(
    'before the compatibility migration: ready, with every Cost Center no department names listed as a row to link later, ids sorted',
    async () => {
      const before = await deployMigrations(database, { through: migrationBefore(LINK_MIGRATION) });
      if (before.code !== 0)
        throw new Error(`Deploying the history before the link migration failed: ${before.stdout}`);
      world = await expansionWorld(sql);
      free = [await freeCostCenter(), await freeCostCenter()];

      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(report.status).toBe('READY');
      expect(ofCostCenter(report)).toEqual({
        blockers: [],
        information: sorted(free).map((costCenterId) => ({ code: 'COST_CENTER_TO_LINK', costCenterId })),
      });
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'after it: each Cost Center with no department blocks by its id — including one the previous release writes late — and the link not being activated is only information',
    async () => {
      const deploy = await deployMigrations(database);
      if (deploy.code !== 0) throw new Error(`Deploying the link migration failed: ${deploy.stdout}`);
      // The previous release is still the running one in the migrate → recreate window, or recovered after a failed deploy.
      const late = await freeCostCenter();
      free.push(late);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.status).toBe('BLOCKED');
      expect(ofCostCenter(report).blockers).toEqual(
        sorted(free).map((costCenterId) => ({ code: 'COST_CENTER_UNLINKED', costCenterId })),
      );
      expect(ofCostCenter(report).information).toEqual([
        { code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: world.organizationId },
      ]);
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'stays blocked through partial linking, for the Cost Centers still unlinked, and through a deliberate rollback to the old runtime that writes another one',
    async () => {
      // One Cost Center is linked (what `ops:cost-center-direction link` does) — the other two stay on the list.
      const department = randomUUID();
      await sql.query(
        `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'BARE-P', 'Bare', now())`,
        [department, world.organizationId],
      );
      await sql.query(
        `INSERT INTO cost_center_department_links (id, organization_id, cost_center_id, department_id, basis_reference, approver_ref, operator_ref, environment)
         VALUES (gen_random_uuid(), $1, $2, $3, 'FIN-2026-017', 'finance', 'ops', 'LOCAL_TEST')`,
        [world.organizationId, free[0], department],
      );
      await sql.query(`UPDATE cost_centers SET department_id = $2, linked_at = now() WHERE id = $1`, [
        free[0],
        department,
      ]);
      const open = free.slice(1);

      const partial = await preflight();
      expect(partial.code).toBe(2);
      expect(ofCostCenter(partial.report).blockers).toEqual(
        sorted(open).map((costCenterId) => ({ code: 'COST_CENTER_UNLINKED', costCenterId })),
      );

      // The old runtime, recovered, creates a free Cost Center of its own: the next run lists it too.
      const another = await freeCostCenter();
      open.push(another);
      const afterRollback = await preflight();
      expect(afterRollback.code).toBe(2);
      expect(ofCostCenter(afterRollback.report).blockers.map((blocker) => blocker.costCenterId)).toEqual(sorted(open));
      free = open;
    },
    CLI_COLD_START_MS * 2,
  );

  it(
    'lists a department whose own column names a Cost Center that belongs to another department — only when the two columns are forced apart, which the sync triggers never leave — and is silent otherwise',
    async () => {
      const [mine, theirs] = [randomUUID(), randomUUID()];
      await sql.query(
        `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'MIS-A', 'A', now()), ($3, $2, 'MIS-B', 'B', now())`,
        [mine, world.organizationId, theirs],
      );
      const center = await freeCostCenter();
      await sql.query(`UPDATE cost_centers SET department_id = $2, linked_at = now() WHERE id = $1`, [center, theirs]);

      // With the triggers in place the department's column cannot contradict the link: nothing is listed for it.
      const consistent = await preflight();
      expect(
        ofCostCenter(consistent.report).blockers.some((blocker) => blocker.code === 'COST_CENTER_LINK_MISMATCH'),
      ).toBe(false);

      // A control run that forces the contradiction (this run only): the backward trigger had pointed the other department's
      // column at the Cost Center; with that cleared, this department's column can name it, against the link.
      await sql.query(`UPDATE departments SET cost_center_id = NULL WHERE id = $1`, [theirs]);
      await sql.query(`UPDATE departments SET cost_center_id = $2 WHERE id = $1`, [mine, center]);
      try {
        const mismatched = await preflight();
        expect(mismatched.report.status).toBe('BLOCKED');
        expect(ofCostCenter(mismatched.report).blockers).toContainEqual({
          code: 'COST_CENTER_LINK_MISMATCH',
          costCenterId: center,
          departmentId: mine,
        });
      } finally {
        await sql.query(`UPDATE departments SET cost_center_id = NULL WHERE id = $1`, [mine]);
        await sql.query(`UPDATE departments SET cost_center_id = $2 WHERE id = $1`, [theirs, center]);
      }
    },
    CLI_COLD_START_MS * 2,
  );

  it(
    'is ready once every Cost Center is linked and the operator has activated the link, and the list is empty',
    async () => {
      // Link what is left (the procedure, in SQL), then the activation the operator records.
      for (const costCenter of free) {
        const department = randomUUID();
        counter += 1;
        await sql.query(
          `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, $3, 'Bare', now())`,
          [department, world.organizationId, `BARE-Z${counter}`],
        );
        await sql.query(
          `INSERT INTO cost_center_department_links (id, organization_id, cost_center_id, department_id, basis_reference, approver_ref, operator_ref, environment)
           VALUES (gen_random_uuid(), $1, $2, $3, 'FIN-2026-017', 'finance', 'ops', 'LOCAL_TEST')`,
          [world.organizationId, costCenter, department],
        );
        await sql.query(`UPDATE cost_centers SET department_id = $2, linked_at = now() WHERE id = $1`, [
          costCenter,
          department,
        ]);
      }
      // The control cases above left two Cost Centers without a department: link them too, so the list is whole.
      const stragglers = await sql.query<{ id: string }>(`SELECT id FROM cost_centers WHERE department_id IS NULL`);
      for (const { id } of stragglers.rows) {
        const department = randomUUID();
        counter += 1;
        await sql.query(
          `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, $3, 'Bare', now())`,
          [department, world.organizationId, `BARE-Y${counter}`],
        );
        await sql.query(`UPDATE cost_centers SET department_id = $2, linked_at = now() WHERE id = $1`, [
          id,
          department,
        ]);
      }
      const notActivated = await preflight();
      expect(ofCostCenter(notActivated.report)).toEqual({
        blockers: [],
        information: [{ code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: world.organizationId }],
      });

      await sql.query(
        `INSERT INTO cost_center_direction_activations (id, organization_id, release_evidence, approver_ref, operator_ref, environment)
         VALUES (gen_random_uuid(), $1, 'deploy run 7, image sha256:abc', 'release-owner', 'ops', 'LOCAL_TEST')`,
        [world.organizationId],
      );

      const { report } = await preflight();

      expect(ofCostCenter(report)).toEqual({ blockers: [], information: [] });
    },
    CLI_COLD_START_MS * 2,
  );
});
