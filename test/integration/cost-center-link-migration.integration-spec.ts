import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { stopCliProcesses } from '../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { expansionWorld, ExpansionWorld, sqlState } from '../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
  schemaDrift,
} from '../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.1a (F01, reviews `P03-RV-03`/`P03-RV-04`, spec L.10 and L.11): the
 * migration `…_cost_center_department_link` is the compatibility step of `QĐ-87d(1)`: every Cost Center belongs to
 * exactly one department. It only adds and relaxes, so the `7c28e75` application — which charges a department to a Cost
 * Center through `departments.cost_center_id` and never writes the new columns — keeps working on the new schema: two
 * triggers keep the old column and the new link equal, and what `7c28e75` writes afterwards is either carried over or
 * listed by the live inventory of `ops:preflight`. Every statement that plays `7c28e75` is plain SQL on the old columns.
 */
const LINK = migrationEndingWith('_cost_center_department_link');

/** F68: the legacy pair whose Cost Center came first, and the pair whose department row is older than its Cost Center. */
const LEGACY = { costCenterCreatedAt: '2026-01-10T00:00:00Z', departmentCreatedAt: '2026-02-01T00:00:00Z' };
const LATE = { costCenterCreatedAt: '2026-03-01T00:00:00Z', departmentCreatedAt: '2026-02-01T00:00:00Z' };

describe('Cost Center ↔ department link, compatibility migration (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  const free = randomUUID();
  const retiredFree = randomUUID();
  const legacy = { department: randomUUID(), costCenter: randomUUID() };
  const late = { department: randomUUID(), costCenter: randomUUID() };
  let counter = 0;

  /** A Cost Center written the way `7c28e75` writes one: no department, no link. */
  const newCostCenter = async (status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, deactivated_at)
       VALUES ($1, $2, $3, 'Unit', 'UNIT', $4::"CostCenterStatus", ${status === 'INACTIVE' ? 'now()' : 'NULL'})`,
      [id, world.organizationId, `CC-N${counter}`, status],
    );

    return id;
  };
  const link = async (id: string) =>
    (
      await sql.query<{ department_id: string | null; linked_at: Date | null }>(
        `SELECT department_id, linked_at FROM cost_centers WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const linkSql = (costCenter: string, department: string) =>
    sqlState(sql, `UPDATE cost_centers SET department_id = $2, linked_at = now() WHERE id = $1`, [
      costCenter,
      department,
    ]);

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: migrationBefore(LINK) });
    if (before.code !== 0) throw new Error(`Deploying the history before the link migration failed: ${before.stdout}`);
    world = await expansionWorld(sql);
    // Creation moments are explicit so the earlier/later of a pair is not a matter of milliseconds (F68): LEG's Cost
    // Center was created first and the department linked it on its own creation; LATE's department row carries an older
    // creation moment than its Cost Center (rows loaded in bulk), the case where the "earlier" moment would be the
    // department's and the link would predate the Cost Center.
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, deactivated_at, created_at) VALUES
         ($1, $3, 'CC-FREE', 'Free', 'UNIT', 'ACTIVE', NULL, now()),
         ($2, $3, 'CC-RETIRED', 'Retired', 'UNIT', 'INACTIVE', now(), now()),
         ($4, $3, 'CC-LEG', 'Legacy', 'UNIT', 'ACTIVE', NULL, '${LEGACY.costCenterCreatedAt}'),
         ($5, $3, 'CC-LATE', 'Late', 'UNIT', 'ACTIVE', NULL, '${LATE.costCenterCreatedAt}')`,
      [free, retiredFree, world.organizationId, legacy.costCenter, late.costCenter],
    );
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, cost_center_id, created_at, updated_at) VALUES
         ($1, $3, 'LEG', 'Legacy', $4, '${LEGACY.departmentCreatedAt}', now()),
         ($2, $3, 'LATE', 'Late', $5, '${LATE.departmentCreatedAt}', now())`,
      [legacy.department, late.department, world.organizationId, legacy.costCenter, late.costCenter],
    );
    // The department keeps its history when its Cost Center is retired later.
    await sql.query(`UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
      legacy.costCenter,
    ]);
    const deploy = await deployMigrations(database);
    if (deploy.code !== 0) throw new Error(`Deploying the link migration failed: ${deploy.stdout}\n${deploy.stderr}`);
  }, DEPLOY_TIMEOUT_MS * 2);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it('copies each department ↔ Cost Center pair into the new columns at the later of the two creation moments; a free one stays unlinked (F68)', async () => {
    const rows = await sql.query<{ code: string; department: string | null; latest: boolean | null }>(
      `SELECT c.code, d.code AS department, (c.linked_at = GREATEST(c.created_at, d.created_at)) AS latest
         FROM cost_centers c LEFT JOIN departments d ON d.id = c.department_id ORDER BY c.code`,
    );

    expect(rows.rows).toEqual([
      { code: 'CC-ENG', department: 'ENG', latest: true },
      { code: 'CC-FREE', department: null, latest: null },
      { code: 'CC-LATE', department: 'LATE', latest: true },
      { code: 'CC-LEG', department: 'LEG', latest: true },
      { code: 'CC-OPS', department: 'OPS', latest: true },
      { code: 'CC-RETIRED', department: null, latest: null },
    ]);
  });

  it('never dates a link before either side of the pair: the Cost Center came first (LEG) or the department row is older (LATE)', async () => {
    const rows = await sql.query<{ code: string; linked_at: Date }>(
      `SELECT c.code, c.linked_at FROM cost_centers c WHERE c.code IN ('CC-LEG', 'CC-LATE') ORDER BY c.code`,
    );
    expect(rows.rows.map((row) => [row.code, row.linked_at.toISOString()])).toEqual([
      ['CC-LATE', '2026-03-01T00:00:00.000Z'],
      ['CC-LEG', '2026-02-01T00:00:00.000Z'],
    ]);

    // The invariant for every linked row, not only the two fixtures.
    const predating = await sql.query<{ code: string }>(
      `SELECT c.code FROM cost_centers c JOIN departments d ON d.id = c.department_id
        WHERE c.linked_at < c.created_at OR c.linked_at < d.created_at`,
    );
    expect(predating.rows).toEqual([]);
  });

  it('a cost dated before the link stays out of the department Cost Center (QĐ-87d(3), INV-14a: linkedAt ≤ t < deactivatedAt)', async () => {
    const currentAt = async (department: string, at: string) =>
      (
        await sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM cost_centers
            WHERE department_id = $1 AND linked_at <= $2::timestamptz AND (deactivated_at IS NULL OR $2::timestamptz < deactivated_at)`,
          [department, at],
        )
      ).rows[0].n;

    // LEG's Cost Center existed on 20 January, but the department — and with it the link — did not: no Cost Center then.
    expect(await currentAt(legacy.department, '2026-01-20T00:00:00Z')).toBe('0');
    expect(await currentAt(legacy.department, '2026-02-15T00:00:00Z')).toBe('1');
    // LATE: the link starts when its Cost Center exists, not on its older department row.
    expect(await currentAt(late.department, '2026-02-15T00:00:00Z')).toBe('0');
    expect(await currentAt(late.department, '2026-03-02T00:00:00Z')).toBe('1');
  });

  it('holds the link whole or absent, and one ACTIVE Cost Center for a department (unlinked or retired ones are free to repeat)', async () => {
    const id = await newCostCenter();

    expect(
      await sqlState(sql, `UPDATE cost_centers SET department_id = $2 WHERE id = $1`, [id, world.departments.eng]),
    ).toBe('23514');
    // ENG already has an ACTIVE Cost Center.
    expect(await linkSql(id, world.departments.eng)).toBe('23505');
    // A retired Cost Center may belong to the department too: it is history, not the current one.
    const retired = await newCostCenter('INACTIVE');
    expect(await linkSql(retired, world.departments.eng)).toBeNull();
  });

  it('never changes or removes a link once it exists (the Cost Center belongs to one department for its whole life)', async () => {
    const id = await newCostCenter('INACTIVE');
    expect(await linkSql(id, world.departments.ops)).toBeNull();

    expect(await linkSql(id, world.departments.eng)).toBe('23514');
    expect(
      await sqlState(sql, `UPDATE cost_centers SET department_id = NULL, linked_at = NULL WHERE id = $1`, [id]),
    ).toBe('23514');
    expect(await sqlState(sql, `UPDATE cost_centers SET name = 'Renamed' WHERE id = $1`, [id])).toBeNull();
  });

  describe('what the previous release (7c28e75) writes after the migration', () => {
    it('a department created around a free Cost Center links it, and the old read of the pair still sees it', async () => {
      const departmentId = randomUUID();
      expect(
        await sqlState(
          sql,
          `INSERT INTO departments (id, organization_id, code, name, cost_center_id, updated_at)
           VALUES ($1, $2, 'NEW', 'New', $3, now())`,
          [departmentId, world.organizationId, free],
        ),
      ).toBeNull();

      const linked = await link(free);
      expect(linked.department_id).toBe(departmentId);
      expect(linked.linked_at).not.toBeNull();
      const old = await sql.query<{ code: string; cc: string }>(
        `SELECT d.code, c.code AS cc FROM departments d JOIN cost_centers c ON c.id = d.cost_center_id WHERE d.id = $1`,
        [departmentId],
      );
      expect(old.rows).toEqual([{ code: 'NEW', cc: 'CC-FREE' }]);
    });

    it('links a free Cost Center no earlier than the Cost Center or the department row, even when a creation moment is ahead of the clock (F68)', async () => {
      const ahead = randomUUID();
      await sql.query(
        `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, created_at)
         VALUES ($1, $2, 'CC-AHEAD', 'Ahead', 'UNIT', 'ACTIVE', now() + interval '1 hour')`,
        [ahead, world.organizationId],
      );
      const departmentId = randomUUID();
      await sql.query(
        `INSERT INTO departments (id, organization_id, code, name, cost_center_id, updated_at)
         VALUES ($1, $2, 'AHEAD', 'Ahead', $3, now())`,
        [departmentId, world.organizationId, ahead],
      );

      const row = (
        await sql.query<{ not_before: boolean }>(
          `SELECT (c.linked_at >= c.created_at AND c.linked_at >= d.created_at) AS not_before
             FROM cost_centers c JOIN departments d ON d.id = c.department_id WHERE c.id = $1`,
          [ahead],
        )
      ).rows[0];
      expect(row.not_before).toBe(true);
    });

    it('a free Cost Center it creates is written unlinked: the live inventory lists it, nothing infers its department', async () => {
      const id = await newCostCenter();

      expect(await link(id)).toEqual({ department_id: null, linked_at: null });
    });

    it('a department with no Cost Center is allowed by the schema now and the guard has nothing to say about it', async () => {
      expect(
        await sqlState(
          sql,
          `INSERT INTO departments (id, organization_id, code, name, cost_center_id, updated_at)
           VALUES ($1, $2, 'NOCC', 'No Cost Center', NULL, now())`,
          [randomUUID(), world.organizationId],
        ),
      ).toBeNull();
      // The guard still refuses a retired Cost Center for a department (what `7c28e75` could never do either).
      expect(
        await sqlState(
          sql,
          `INSERT INTO departments (id, organization_id, code, name, cost_center_id, updated_at)
           VALUES ($1, $2, 'BAD', 'Bad', $3, now())`,
          [randomUUID(), world.organizationId, retiredFree],
        ),
      ).toBe('23514');
    });
  });

  describe('what the compatibility application writes, read back by the previous release', () => {
    it('a new ACTIVE Cost Center linked to a department whose own was retired becomes the one the old column points to', async () => {
      const current = await newCostCenter();
      expect(
        await sqlState(sql, `UPDATE cost_centers SET department_id = $2, linked_at = now() WHERE id = $1`, [
          current,
          legacy.department,
        ]),
      ).toBeNull();

      const old = await sql.query<{ cc: string }>(
        `SELECT c.id AS cc FROM departments d JOIN cost_centers c ON c.id = d.cost_center_id WHERE d.id = $1`,
        [legacy.department],
      );
      expect(old.rows).toEqual([{ cc: current }]);
    });

    it('a retired Cost Center linked to a department as history leaves the old column alone', async () => {
      const before = (
        await sql.query<{ cost_center_id: string }>(`SELECT cost_center_id FROM departments WHERE id = $1`, [
          world.departments.ops,
        ])
      ).rows[0].cost_center_id;
      const history = await newCostCenter('INACTIVE');
      expect(await linkSql(history, world.departments.ops)).toBeNull();

      const after = (
        await sql.query<{ cost_center_id: string }>(`SELECT cost_center_id FROM departments WHERE id = $1`, [
          world.departments.ops,
        ])
      ).rows[0].cost_center_id;
      expect(after).toBe(before);
    });
  });

  describe('cost_center_department_links: the durable record of a link made by procedure', () => {
    const record = (costCenter: string, overrides: { basis?: string; environment?: string } = {}) =>
      sqlState(
        sql,
        `INSERT INTO cost_center_department_links
           (id, organization_id, cost_center_id, department_id, basis_reference, approver_ref, operator_ref, environment)
         VALUES ($1, $2, $3, $4, $5, 'finance-lead', 'ops-1', $6)`,
        [
          randomUUID(),
          world.organizationId,
          costCenter,
          world.departments.eng,
          overrides.basis ?? 'FIN-2026-017',
          overrides.environment ?? 'LOCAL_TEST',
        ],
      );

    it('takes one row for a Cost Center that has no department yet, and only one', async () => {
      const id = await newCostCenter('INACTIVE');
      expect(await record(id)).toBeNull();
      expect(await record(id)).toBe('23505');
    });

    it('refuses a row for a Cost Center that already has its department, and checks the basis and the environment', async () => {
      const linked = await newCostCenter('INACTIVE');
      await linkSql(linked, world.departments.eng);
      expect(await record(linked)).toBe('23514');

      const id = await newCostCenter('INACTIVE');
      expect(await record(id, { basis: 'x' })).toBe('23514');
      expect(await record(id, { basis: 'y'.repeat(201) })).toBe('23514');
      expect(await record(id, { environment: 'PRODUCTION' })).toBe('23514');
    });

    it('is append-only', async () => {
      const id = await newCostCenter('INACTIVE');
      await record(id);

      expect(
        await sqlState(
          sql,
          `UPDATE cost_center_department_links SET basis_reference = 'changed' WHERE cost_center_id = $1`,
          [id],
        ),
      ).toBe('23001');
      expect(await sqlState(sql, `DELETE FROM cost_center_department_links WHERE cost_center_id = $1`, [id])).toBe(
        '23001',
      );
      expect(await sqlState(sql, `TRUNCATE cost_center_department_links`)).toBe('23001');
    });
  });

  describe('cost_center_direction_activations: one irreversible row for the organization', () => {
    const activate = (evidence = 'deploy 2026-10-28 run 7, image sha256:abc') =>
      sqlState(
        sql,
        `INSERT INTO cost_center_direction_activations
           (id, organization_id, release_evidence, approver_ref, operator_ref, environment)
         VALUES ($1, $2, $3, 'release-owner', 'ops-1', 'SHARED')`,
        [randomUUID(), world.organizationId, evidence],
      );

    it('checks the evidence, takes one row for the organization, and never changes or removes it', async () => {
      expect(await activate('x')).toBe('23514');
      expect(await activate('y'.repeat(201))).toBe('23514');
      expect(await activate()).toBeNull();
      expect(await activate()).toBe('23505');
      expect(await sqlState(sql, `UPDATE cost_center_direction_activations SET approver_ref = 'someone'`)).toBe(
        '23001',
      );
      expect(await sqlState(sql, `DELETE FROM cost_center_direction_activations`)).toBe('23001');
      expect(await sqlState(sql, `TRUNCATE cost_center_direction_activations`)).toBe('23001');
    });
  });

  it(
    'leaves a clean migration history and the schema exactly as prisma/models describe it (DB-16)',
    async () => {
      const history = await sql.query<{
        migration_name: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>(`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`);

      expect(history.rows.filter((row) => row.finished_at === null || row.rolled_back_at !== null)).toEqual([]);
      expect(history.rows.map((row) => row.migration_name)).toContain(LINK);
      expect((await schemaDrift(database)).code).toBe(0);
    },
    DEPLOY_TIMEOUT_MS,
  );
});
