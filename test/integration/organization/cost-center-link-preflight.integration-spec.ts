import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../../support/cli-process';
import { activateCostCenterLink, lastCompatibilityMigration } from '../../support/compat-release';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { expansionWorld, ExpansionWorld } from '../../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.1a and 1.1 (F01, spec L.11): the live inventory of `ops:preflight` for the
 * Cost Center link, as the FINAL release reads it. A database before the compatibility migration that holds an organization is
 * blocked (`COST_CENTER_DIRECTION_EXPANSION_REQUIRED`); on the compatibility schema every Cost Center with no department —
 * whoever created it, including the previous release recovered by H7 or still running in the migrate → recreate window — blocks,
 * and so does an organization whose link the operator has not activated (`COST_CENTER_DIRECTION_NOT_ACTIVATED`, information in the
 * compatibility release), ids only, recomputed on every run, through partial linking until the last one is linked. After the
 * final migration the old column is gone and nothing about the direction can be open. The command is real
 * (`src/cli.ts preflight` through ts-node) on a database whose history Prisma recorded itself.
 */
const LINK_MIGRATION = migrationEndingWith('_cost_center_department_link');

interface Report {
  status: 'READY' | 'BLOCKED';
  history: string;
  blockers: Array<{ code: string; costCenterId?: string; departmentId?: string; organizationId?: string }>;
  information: Array<{ code: string; costCenterId?: string; organizationId?: string; subscriptionId?: string }>;
}

describe('ops:preflight, the Cost Center link (integration, real CLI and PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  let counter = 0;

  const preflight = async (): Promise<{ code: number | null; report: Report }> => {
    const result = await runCli('preflight', ['--json'], {
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
  /** What the report lists for the unlinked Cost Centers, in the order of the report. */
  const unlinked = (ids: string[]) =>
    [...ids].sort().map((costCenterId) => ({ code: 'COST_CENTER_UNLINKED', costCenterId }));
  const notActivated = () => ({ code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: world.organizationId });
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
    'before the compatibility migration with no organization (a new database): ready, nothing to list',
    async () => {
      const before = await deployMigrations(database, { through: migrationBefore(LINK_MIGRATION) });
      if (before.code !== 0)
        throw new Error(`Deploying the history before the link migration failed: ${before.stdout}`);

      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(ofCostCenter(report)).toEqual({ blockers: [], information: [] });
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );

  it(
    'before the compatibility migration with an organization: BLOCKED, the organization named by its id, no Cost Center listed (the release skipped the compatibility release)',
    async () => {
      world = await expansionWorld(sql);
      free = [await freeCostCenter(), await freeCostCenter()];

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.status).toBe('BLOCKED');
      expect(ofCostCenter(report)).toEqual({
        blockers: [{ code: 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED', organizationId: world.organizationId }],
        information: [],
      });
    },
    CLI_COLD_START_MS,
  );

  it(
    'on the compatibility schema: each Cost Center with no department blocks by its id — including one the previous release writes late — and so does the link not being activated',
    async () => {
      const deploy = await deployMigrations(database, { through: lastCompatibilityMigration() });
      if (deploy.code !== 0) throw new Error(`Deploying the compatibility release failed: ${deploy.stdout}`);
      // The previous release is still the running one in the migrate → recreate window, or recovered after a failed deploy.
      free.push(await freeCostCenter());

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.status).toBe('BLOCKED');
      expect(ofCostCenter(report)).toEqual({ blockers: [notActivated(), ...unlinked(free)], information: [] });
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
      expect(ofCostCenter(partial.report).blockers).toEqual([notActivated(), ...unlinked(open)]);

      // The old runtime, recovered, creates a free Cost Center of its own: the next run lists it too.
      open.push(await freeCostCenter());
      const afterRollback = await preflight();
      expect(afterRollback.code).toBe(2);
      expect(ofCostCenter(afterRollback.report).blockers).toEqual([notActivated(), ...unlinked(open)]);
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
    'is blocked once every Cost Center is linked until the operator has activated the link, then ready, and the list is empty',
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
      // The control cases above left a Cost Center without a department: link it too, so the list is whole.
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
      const before = await preflight();
      expect(before.code).toBe(2);
      expect(ofCostCenter(before.report)).toEqual({ blockers: [notActivated()], information: [] });

      await activateCostCenterLink(sql, world.organizationId);

      const { code, report } = await preflight();

      expect(ofCostCenter(report)).toEqual({ blockers: [], information: [] });
      expect({ code, status: report.status }).toEqual({ code: 0, status: 'READY' });
    },
    CLI_COLD_START_MS * 3,
  );

  it(
    'after the final migration the old department column is gone: nothing about the direction is read, nothing is listed, the preflight is ready',
    async () => {
      const deploy = await deployMigrations(database);
      if (deploy.code !== 0) throw new Error(`Deploying the final release failed: ${deploy.stdout}\n${deploy.stderr}`);

      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(report).toMatchObject({ status: 'READY', history: 'CONVERGED', blockers: [], information: [] });
      const columns = await sql.query<{ table_name: string; column_name: string; is_nullable: string }>(
        `SELECT table_name, column_name, is_nullable FROM information_schema.columns
          WHERE (table_name = 'cost_centers' AND column_name IN ('department_id', 'linked_at'))
             OR (table_name = 'departments' AND column_name = 'cost_center_id') ORDER BY table_name, column_name`,
      );
      expect(columns.rows).toEqual([
        { table_name: 'cost_centers', column_name: 'department_id', is_nullable: 'NO' },
        { table_name: 'cost_centers', column_name: 'linked_at', is_nullable: 'NO' },
      ]);
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS,
  );
});
