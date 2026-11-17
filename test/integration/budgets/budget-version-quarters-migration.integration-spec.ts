import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { stopCliProcesses } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const TARGET = migrationEndingWith('_fixlb3_version_quarters_cleared');

/** One organization with an employee and a Cost Center, written the way the schema before the migration wants them. */
async function seedWorld(sql: Client) {
  const organizationId = randomUUID();
  await sql.query(
    `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
    [organizationId],
  );
  const employeeId = randomUUID();
  await sql.query(
    `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
     VALUES ($1, $2, 'E-1', 'Finance One', 'STAFF', '2026-01-01', now())`,
    [employeeId, organizationId],
  );
  const departmentId = randomUUID();
  await sql.query(
    `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'P-OPS', 'Operations', now())`,
    [departmentId, organizationId],
  );
  const costCenterId = randomUUID();
  await sql.query(
    `INSERT INTO cost_centers (id, organization_id, code, name, kind, department_id, linked_at)
     VALUES ($1, $2, 'CC-OPS', 'Operations', 'UNIT', $3, now())`,
    [costCenterId, organizationId, departmentId],
  );

  return { organizationId, employeeId, costCenterId };
}

/**
 * FIX-LB3 LBG-03 (`QĐ-111ac`: no quarter, one amount for the year): a version a release before BG-2 left as a draft, or sent back to
 * Finance, can still hold a forecast by quarter; the first change of its base made the total differ from the quarters and the database
 * refused it (`budget_versions_quarters_check`). The migration clears the quarters of the versions Finance can still change and touches
 * no version that was sent, approved, refused or closed.
 */
describe('the migration that clears the quarters of the versions still being built (integration, real PostgreSQL)', () => {
  it(
    'clears q1..q4 of a draft and of a version sent back, and leaves every other version as it was',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
        const world = await seedWorld(sql);
        // A version of a year each (a Cost Center has one in flight and one current at a time), 100 for the year, 25 a quarter.
        const insert = async (year: number, state: string) => {
          const id = randomUUID();
          const sentAt = state === 'DRAFT' ? null : new Date().toISOString();
          const sentBy = state === 'DRAFT' ? null : world.employeeId;
          const expiredAt = state === 'EXPIRED' ? new Date().toISOString() : null;
          await sql.query(
            `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, origin, base_minor, reserve_minor,
                total_minor, currency, created_by_employee_id, q1_minor, q2_minor, q3_minor, q4_minor, sent_at, sent_by_employee_id, expired_at)
             VALUES ($1, $2, $3, $4, 1, 'INITIAL', $5::"BudgetVersionState", 'BASELINE_NO_PROPOSAL', 90, 10, 100, 'VND', $6, 25, 25, 25, 25, $7, $8, $9)`,
            [id, world.organizationId, world.costCenterId, year, state, world.employeeId, sentAt, sentBy, expiredAt],
          );

          return id;
        };
        const draft = await insert(2027, 'DRAFT');
        const sentBack = await insert(2028, 'CHANGES_REQUESTED');
        const sent = await insert(2029, 'SENT');
        const approved = await insert(2030, 'APPROVED');
        const refused = await insert(2031, 'REJECTED');
        const closed = await insert(2032, 'EXPIRED');
        // A draft that never had quarters stays as it is.
        const plain = randomUUID();
        await sql.query(
          `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, origin, base_minor, reserve_minor,
              total_minor, currency, created_by_employee_id)
           VALUES ($1, $2, $3, 2033, 1, 'INITIAL', 'DRAFT', 'BASELINE_NO_PROPOSAL', 90, 10, 100, 'VND', $4)`,
          [plain, world.organizationId, world.costCenterId, world.employeeId],
        );
        // The way the bug showed: the total moves and the quarters stay, so the database refuses it.
        await expect(
          sql.query(`UPDATE budget_versions SET base_minor = 190, total_minor = 200 WHERE id = $1`, [draft]),
        ).rejects.toMatchObject({ code: '23514' });

        const deployed = await deployMigrations(database, { through: TARGET });
        if (deployed.code !== 0)
          throw new Error(`Deploying the migration failed: ${deployed.stdout}\n${deployed.stderr}`);

        const quarters = async (id: string) =>
          (
            await sql.query<{ q: (string | null)[] }>(
              `SELECT ARRAY[q1_minor, q2_minor, q3_minor, q4_minor]::text[] AS q FROM budget_versions WHERE id = $1`,
              [id],
            )
          ).rows[0].q;
        expect(await quarters(draft)).toEqual([null, null, null, null]);
        expect(await quarters(sentBack)).toEqual([null, null, null, null]);
        expect(await quarters(plain)).toEqual([null, null, null, null]);
        for (const untouched of [sent, approved, refused, closed]) {
          expect(await quarters(untouched)).toEqual(['25', '25', '25', '25']);
        }
        // The draft is changeable again, and its figures were not moved by the migration.
        await sql.query(`UPDATE budget_versions SET base_minor = 190, total_minor = 200 WHERE id = $1`, [draft]);
        const { rows } = await sql.query<{ base_minor: string; total_minor: string }>(
          `SELECT base_minor::text, total_minor::text FROM budget_versions WHERE id = $1`,
          [sentBack],
        );
        expect(rows).toEqual([{ base_minor: '90', total_minor: '100' }]);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS * 2 + 60_000,
  );
});
