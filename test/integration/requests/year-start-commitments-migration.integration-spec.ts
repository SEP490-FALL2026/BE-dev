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
  schemaDrift,
} from '../../support/migration-history';

const TARGET = migrationEndingWith('_year_start_commitments');
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

/**
 * The commitments of 01/01 (`BR-MF1-09e`, `QĐ-109a`): the migration that adds the origin of a commitment, the price of a month and the mark of the
 * pass runs on a database that already holds an organization and commitments. The history before it is replayed, a request with two commitments
 * is written the way it was, and then the migration runs.
 */
describe('the migration of the commitments of 01/01 over an organization that already has commitments (integration, real PostgreSQL)', () => {
  it(
    'BR-MF1-09e: keeps what was committed as the commitment of an approval, marks the year of the deployment done for the organization, and refuses what the pass must never write',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
        const organizationId = randomUUID();
        await sql.query(
          `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'Asia/Ho_Chi_Minh', 'VND')`,
          [organizationId],
        );
        const employeeId = randomUUID();
        await sql.query(
          `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
         VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
          [employeeId, organizationId],
        );
        const departmentId = randomUUID();
        await sql.query(
          `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'P-ENG', 'Engineering', now())`,
          [departmentId, organizationId],
        );
        const costCenterId = randomUUID();
        await sql.query(
          `INSERT INTO cost_centers (id, organization_id, code, name, kind, department_id, linked_at)
         VALUES ($1, $2, 'CC-ENG', 'Engineering', 'UNIT', $3, now())`,
          [costCenterId, organizationId, departmentId],
        );
        const requestId = randomUUID();
        await sql.query(
          `INSERT INTO access_requests (id, organization_id, branch, state, requester_employee_id, department_id, cost_center_id,
            business_reason, policy, created_by_app_user_id, pricing_status, amount_minor, amount_currency, unit_price_minor, billing_cycle, budget_year)
         VALUES ($1, $2, 'NEW_SOFTWARE', 'PENDING', $3, $4, $5, 'Design work', '{}'::jsonb, $6, 'PRICED', 20000, 'VND', 20000, 'MONTHLY', 2026)`,
          [requestId, organizationId, employeeId, departmentId, costCenterId, randomUUID()],
        );
        await sql.query(
          `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, unattached_reason)
         VALUES ($1, $2, $3, $4, 2026, 20000, 'VND', 'HELD'::"CommitmentState", 'NO_BUDGET')`,
          [randomUUID(), organizationId, requestId, costCenterId],
        );

        await sql.query(sqlOf(TARGET));

        const commitments = await sql.query<{
          origin: string;
          seat_monthly_minor: string | null;
          amount_minor: string;
        }>(
          `SELECT origin::text, seat_monthly_minor::text, amount_minor::text FROM budget_commitments WHERE request_id = $1`,
          [requestId],
        );
        expect(commitments.rows).toEqual([{ origin: 'APPROVAL', seat_monthly_minor: null, amount_minor: '20000' }]);
        // The year of the deployment (in the calendar of the organization) is marked done with nothing made; no other year is.
        const marks = await sql.query<{ year: number; done: boolean; created_count: number; expected: number }>(
          `SELECT year, completed_at IS NOT NULL AS done, created_count,
                EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS expected
           FROM year_start_commitment_runs WHERE organization_id = $1`,
          [organizationId],
        );
        expect(marks.rows).toHaveLength(1);
        expect(marks.rows[0]).toMatchObject({ done: true, created_count: 0 });
        expect(marks.rows[0].year).toBe(marks.rows[0].expected);

        // The rules of the new columns are the ones the database keeps.
        const hold = (year: number, extra: string, values: unknown[]) =>
          sqlState(
            sql,
            `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, unattached_reason, ${extra})
           VALUES ($1, $2, $3, $4, $5, 100, 'VND', 'HELD'::"CommitmentState", 'NO_BUDGET', ${values.map((_, index) => `$${index + 6}`).join(', ')})`,
            [randomUUID(), organizationId, requestId, costCenterId, year, ...values],
          );
        expect(await hold(2027, 'seat_monthly_minor', [0])).toBe('23514');
        expect(await hold(2027, 'seat_monthly_minor', [1000])).toBeNull();
        // No check backs a commitment of 01/01 (nobody decided it): the database refuses a commitment of that origin that names one.
        expect(await hold(2028, 'origin, snapshot_check_id', ['YEAR_START', randomUUID()])).toBe('23514');
        expect(await sqlState(sql, `DELETE FROM organizations WHERE id = $1`, [organizationId])).toBe('23503');
        expect(await schemaDrift(database).then((result) => result.code)).toBe(0);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS * 2 + 60_000,
  );

  it(
    'BR-MF1-09e: the full history deploys on a clean database and leaves no mark: no organization, nothing to mark',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const deployed = await deployMigrations(database);
        if (deployed.code !== 0) throw new Error(`Deploying the history failed: ${deployed.stdout}`);

        expect((await sql.query(`SELECT count(*)::int AS n FROM year_start_commitment_runs`)).rows[0]).toEqual({
          n: 0,
        });
        expect(
          (
            await sql.query(
              `SELECT column_default FROM information_schema.columns WHERE table_name = 'budget_commitments' AND column_name = 'origin'`,
            )
          ).rows[0],
        ).toEqual({ column_default: '\'APPROVAL\'::"CommitmentOrigin"' });
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS + 60_000,
  );
});
