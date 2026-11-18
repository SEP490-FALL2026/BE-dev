import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT, stopCliProcesses } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const TARGET = migrationEndingWith('_budget_lines_bm10_cleanup');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/** One organization with an employee and a department that has a Cost Center, written the way the schema before the migration wants them. */
async function seedWorld(sql: Client) {
  const organizationId = randomUUID();
  await sql.query(
    `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
    [organizationId],
  );
  const ownerEmployeeId = randomUUID();
  await sql.query(
    `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
     VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
    [ownerEmployeeId, organizationId],
  );
  const departmentId = randomUUID();
  await sql.query(
    `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'P-ENG', 'Engineering', now())`,
    [departmentId, organizationId],
  );
  const costCenter = randomUUID();
  await sql.query(
    `INSERT INTO cost_centers (id, organization_id, code, name, kind, department_id, linked_at)
     VALUES ($1, $2, 'CC-ENG', 'Engineering', 'UNIT', $3, now())`,
    [costCenter, organizationId, departmentId],
  );

  return { organizationId, ownerEmployeeId, costCenter };
}

/**
 * `BM-10` lines (`QĐ-103`, `QĐ-109c`, `QĐ-109d`): the migration that gives a proposal line its type, ZBB, rank and flag runs on a
 * database that already holds proposals of several lines. The history before it is replayed, a proposal of three lines and a version
 * line made from the second are written the way they were, and then the migration runs.
 */
describe('the migration of the BM-10 lines over proposals that already have lines (integration, real PostgreSQL)', () => {
  it(
    'ranks each existing line by its position, copies the rank to the version line made from it, and refuses legacy revision data',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
        const world = await seedWorld(sql);
        const proposal = randomUUID();
        await sql.query(
          `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency,
              submitted_by_employee_id, submitted_at)
           VALUES ($1, $2, $3, 2027, 'SUBMITTED', 600, 'VND', $4, now())`,
          [proposal, world.organizationId, world.costCenter, world.ownerEmployeeId],
        );
        for (const position of [1, 2, 3]) {
          await sql.query(
            `INSERT INTO budget_proposal_lines (proposal_id, position, description, amount_minor) VALUES ($1, $2, $3, 200)`,
            [proposal, position, `line ${position}`],
          );
        }
        const version = randomUUID();
        await sql.query(
          `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, proposal_id, base_minor,
              reserve_minor, total_minor, currency, created_by_employee_id)
           VALUES ($1, $2, $3, 2027, 1, 'INITIAL', 'DRAFT', $4, 600, 0, 600, 'VND', $5)`,
          [version, world.organizationId, world.costCenter, proposal, world.ownerEmployeeId],
        );
        await sql.query(
          `INSERT INTO budget_version_lines (version_id, position, description, amount_minor, proposal_id, proposal_position)
           VALUES ($1, 1, 'from line 2', 200, $2, 2), ($1, 2, 'added by Finance', 50, NULL, NULL)`,
          [version, proposal],
        );

        // Legacy revision data blocks the migration (nothing is deleted silently), and a blocked migration leaves nothing behind.
        await sql.query('BEGIN');
        await sql.query(
          `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, base_minor, reserve_minor,
              total_minor, currency, created_by_employee_id, based_on_version_id, reason)
           VALUES ($1, $2, $3, 2028, 1, 'REVISION', 'DRAFT', 600, 0, 600, 'VND', $4, $5, 'legacy')`,
          [randomUUID(), world.organizationId, world.costCenter, world.ownerEmployeeId, version],
        );
        await expect(sql.query(sqlOf(TARGET))).rejects.toThrow(/REVISION/);
        await sql.query('ROLLBACK');

        await sql.query(sqlOf(TARGET));

        const ranks = await sql.query<{ position: number; priority_rank: number; line_type: string }>(
          `SELECT position, priority_rank, line_type FROM budget_proposal_lines WHERE proposal_id = $1 ORDER BY position`,
          [proposal],
        );
        expect(ranks.rows).toEqual([
          { position: 1, priority_rank: 1, line_type: 'NEW' },
          { position: 2, priority_rank: 2, line_type: 'NEW' },
          { position: 3, priority_rank: 3, line_type: 'NEW' },
        ]);
        const versionRanks = await sql.query<{ position: number; priority_rank: number | null }>(
          `SELECT position, priority_rank FROM budget_version_lines WHERE version_id = $1 ORDER BY position`,
          [version],
        );
        expect(versionRanks.rows).toEqual([
          { position: 1, priority_rank: 2 },
          { position: 2, priority_rank: null },
        ]);

        // The rules of the new columns are the ones the database keeps.
        const rank = (position: number, value: number) =>
          sqlState(
            sql,
            `UPDATE budget_proposal_lines SET priority_rank = $1 WHERE proposal_id = $2 AND position = $3`,
            [value, proposal, position],
          );
        expect(await rank(1, 2)).toBe('23505');
        expect(await rank(1, 0)).toBe('23514');
        expect(await rank(1, 9)).toBeNull();
        expect(await sqlState(sql, `UPDATE budget_versions SET state = 'SUPERSEDED' WHERE id = $1`, [version])).toBe(
          '23514',
        );
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS + 60_000,
  );
});
