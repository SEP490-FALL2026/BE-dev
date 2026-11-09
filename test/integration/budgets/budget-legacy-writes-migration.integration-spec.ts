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

const TARGET = migrationEndingWith('_budget_legacy_writes_blocked');

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
 * G5-03, G5-04 (`RV-15`, `C4-14`, `QĐ-100h`): the migration that stops the retired budget columns from being written runs over a database
 * that already holds a version built from the baseline before lines had a kind and a version with a high-value threshold. The lines of the
 * baseline version become Renew lines; the old threshold stays and its version stays editable; nothing retired is written again.
 */
describe('the migration that blocks the retired budget writes (integration, real PostgreSQL)', () => {
  it(
    'G5-04 marks the old lines of a baseline version Renew; G5-03 keeps old values, refuses new ones and asks every line its kind',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
        const world = await seedWorld(sql);
        // A baseline version made before the lines had a kind: its lines were backfilled NEW.
        const baseline = randomUUID();
        await sql.query(
          `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, origin, base_minor, reserve_minor,
              total_minor, currency, created_by_employee_id, created_at)
           VALUES ($1, $2, $3, 2027, 1, 'INITIAL', 'DRAFT', 'BASELINE_NO_HEAD', 300, 0, 300, 'VND', $4, '2026-01-01T00:00:00Z')`,
          [baseline, world.organizationId, world.costCenterId, world.employeeId],
        );
        await sql.query(
          `INSERT INTO budget_version_lines (version_id, position, description, amount_minor, line_type, window_from, window_to)
           VALUES ($1, 1, 'Renew Slack Pro', 200, 'NEW', '2027-01-01', '2027-12-31'),
                  ($1, 2, 'Renew Figma Pro', 100, 'NEW', NULL, NULL)`,
          [baseline],
        );
        // A version of a proposal with the old high-value threshold.
        const proposal = randomUUID();
        await sql.query(
          `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency, submitted_by_employee_id,
              submitted_at)
           VALUES ($1, $2, $3, 2028, 'SUBMITTED', 100, 'VND', $4, now())`,
          [proposal, world.organizationId, world.costCenterId, world.employeeId],
        );
        await sql.query(
          `INSERT INTO budget_proposal_lines (proposal_id, position, description, amount_minor, line_type, priority_rank)
           VALUES ($1, 1, 'Figma', 100, 'NEW', 1)`,
          [proposal],
        );
        const versioned = randomUUID();
        await sql.query(
          `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, proposal_id, base_minor,
              reserve_minor, total_minor, currency, high_value_percent, created_by_employee_id)
           VALUES ($1, $2, $3, 2028, 1, 'INITIAL', 'DRAFT', $4, 100, 0, 100, 'VND', 20, $5)`,
          [versioned, world.organizationId, world.costCenterId, proposal, world.employeeId],
        );

        const deployed = await deployMigrations(database, { through: TARGET });
        if (deployed.code !== 0)
          throw new Error(`Deploying the migration failed: ${deployed.stdout}\n${deployed.stderr}`);

        // G5-04: the baseline lines are what the department runs on.
        const kinds = await sql.query<{ position: number; line_type: string }>(
          `SELECT position, line_type::text FROM budget_version_lines WHERE version_id = $1 ORDER BY position`,
          [baseline],
        );
        expect(kinds.rows).toEqual([
          { position: 1, line_type: 'RENEW' },
          { position: 2, line_type: 'RENEW' },
        ]);

        // G5-03: old values stay and their rows stay editable; nothing retired is written again.
        expect(
          await sqlState(
            sql,
            `UPDATE budget_version_lines SET amount_minor = 250 WHERE version_id = $1 AND position = 1`,
            [baseline],
          ),
        ).toBeNull();
        expect(
          await sqlState(
            sql,
            `UPDATE budget_version_lines SET window_to = '2027-06-30' WHERE version_id = $1 AND position = 1`,
            [baseline],
          ),
        ).toBe('23514');
        expect(
          await sqlState(
            sql,
            `UPDATE budget_version_lines SET repeat_cycle = 'ANNUAL' WHERE version_id = $1 AND position = 2`,
            [baseline],
          ),
        ).toBe('23514');
        expect(
          await sqlState(sql, `UPDATE budget_versions SET base_minor = 90, total_minor = 90 WHERE id = $1`, [
            versioned,
          ]),
        ).toBeNull();
        expect(
          await sqlState(sql, `UPDATE budget_versions SET high_value_percent = 30 WHERE id = $1`, [versioned]),
        ).toBe('23514');
        expect(await sqlState(sql, `UPDATE budget_versions SET reason = 'revised' WHERE id = $1`, [versioned])).toBe(
          '23514',
        );
        expect(
          await sqlState(
            sql,
            `INSERT INTO budget_version_lines (version_id, position, description, amount_minor, line_type, quote_valid_until)
             VALUES ($1, 3, 'Quote', 10, 'NEW', '2027-03-31')`,
            [baseline],
          ),
        ).toBe('23514');
        expect(
          await sqlState(
            sql,
            `INSERT INTO budget_version_line_changes (id, version_id, position, window_from_before, window_to_before, window_from_after,
                window_to_after, reason, changed_by_employee_id)
             VALUES (gen_random_uuid(), $1, 1, '2027-01-01', '2027-12-31', '2027-02-01', '2027-12-31', 'moved', $2)`,
            [baseline, world.employeeId],
          ),
        ).toBe('23514');
        expect(
          await sqlState(
            sql,
            `UPDATE budget_versions SET kind = 'REVISION', based_on_version_id = $2, proposal_id = NULL WHERE id = $1`,
            [versioned, baseline],
          ),
        ).toBe('23514');

        // A line names its kind: there is no default any more.
        expect(
          await sqlState(
            sql,
            `INSERT INTO budget_version_lines (version_id, position, description, amount_minor) VALUES ($1, 4, 'No kind', 10)`,
            [baseline],
          ),
        ).toBe('23502');
        expect(
          await sqlState(
            sql,
            `INSERT INTO budget_proposal_lines (proposal_id, position, description, amount_minor, priority_rank)
             VALUES ($1, 2, 'No kind', 10, 2)`,
            [proposal],
          ),
        ).toBe('23502');
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS * 2 + 60_000,
  );
});
