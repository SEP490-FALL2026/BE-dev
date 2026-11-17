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

const RETIRED_SPEND_DAY = migrationEndingWith('_request_pricing_one_amount');

async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/**
 * `QĐ-111an` (FX-1.1): the conversion of prices into dong on a database that holds what the releases before `20261109130000` wrote. That
 * migration added two CHECK constraints `NOT VALID` to `request_supplements` which refuse any new version of a row written before it: a
 * supplementary file that changed the day the money goes out (the spend day is set, the amounts may be equal). The history before it is
 * replayed, such files are written, and then the whole history after it is deployed, the conversion among it: it must not stop.
 */
describe('the conversion of prices into dong on the history of an older release (integration, real PostgreSQL)', () => {
  it(
    'converts the supplementary files that changed the spend day, keeps what they said, and puts the append-only guard and the two NOT VALID checks back',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(RETIRED_SPEND_DAY) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);

        const organizationId = randomUUID();
        await sql.query(
          `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
          [organizationId],
        );
        const departmentId = randomUUID();
        await sql.query(
          `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'P-OLD', 'Old', now())`,
          [departmentId, organizationId],
        );
        const employeeId = randomUUID();
        await sql.query(
          `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
           VALUES ($1, $2, 'E-OLD', 'Old Employee', 'STAFF', '2026-01-01', now())`,
          [employeeId, organizationId],
        );
        const applicationId = randomUUID();
        await sql.query(
          `INSERT INTO applications (id, organization_id, kind, name, normalized_name, business_owner_employee_id, data_sensitivity,
             comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
           VALUES ($1, $2, 'INTERNAL', 'Portal', 'portal', $3, 'LOW', false, false, false, false)`,
          [applicationId, organizationId, employeeId],
        );
        const planId = randomUUID();
        await sql.query(
          `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type)
           VALUES ($1, $2, $3, 'Portal plan', 'portal plan', 'K5')`,
          [planId, organizationId, applicationId],
        );
        await sql.query(
          `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate) VALUES ($1, $2, 'USD', '2026-09-01', 25400)`,
          [randomUUID(), organizationId],
        );
        const requestId = randomUUID();
        await sql.query(
          `INSERT INTO access_requests (id, organization_id, branch, state, plan_id, requester_employee_id, department_id,
             business_reason, term_months, policy, created_by_app_user_id)
           VALUES ($1, $2, 'INTERNAL_FREE', 'PENDING', $3, $4, $5, 'Design', 6, '{"version":1}'::jsonb, $6)`,
          [requestId, organizationId, planId, employeeId, departmentId, randomUUID()],
        );
        // A file as an older release wrote it: the spend day changed, the amounts may stay equal; the day is set (a file of today has none).
        const file = async (number: number, beforeMinor: number, afterMinor: number): Promise<string> => {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO request_supplements (id, organization_id, request_id, number, reason, changed_by_employee_id,
               before_expected_spend_on, after_expected_spend_on, before_budget_year, after_budget_year,
               before_amount_minor, after_amount_minor, currency)
             VALUES ($1, $2, $3, $4, 'The money goes out later', $5, '2026-10-01', '2026-11-01', 2026, 2026, $6, $7, 'USD')`,
            [id, organizationId, requestId, number, employeeId, beforeMinor, afterMinor],
          );

          return id;
        };
        const sameAmounts = await file(1, 50000, 50000);
        const otherAmounts = await file(2, 50000, 40000);

        const after = await deployMigrations(database);
        expect({ code: after.code, failure: after.code === 0 ? '' : after.stderr.slice(-1500) }).toEqual({
          code: 0,
          failure: '',
        });

        const rows = await sql.query<{
          id: string;
          before_amount_minor: string;
          after_amount_minor: string;
          currency: string;
          before_spend: string | null;
          after_spend: string | null;
        }>(
          `SELECT id, before_amount_minor::text, after_amount_minor::text, currency,
                  to_char(before_expected_spend_on, 'YYYY-MM-DD') AS before_spend, to_char(after_expected_spend_on, 'YYYY-MM-DD') AS after_spend
             FROM request_supplements WHERE request_id = $1`,
          [requestId],
        );
        const byId = new Map(rows.rows.map((row) => [row.id, row]));
        expect(byId.get(sameAmounts)).toMatchObject({
          before_amount_minor: '12700000',
          after_amount_minor: '12700000',
          currency: 'VND',
          before_spend: '2026-10-01',
          after_spend: '2026-11-01',
        });
        expect(byId.get(otherAmounts)).toMatchObject({
          before_amount_minor: '12700000',
          after_amount_minor: '10160000',
          currency: 'VND',
        });

        const checks = await sql.query<{ conname: string; convalidated: boolean }>(
          `SELECT conname, convalidated FROM pg_constraint
            WHERE conrelid = 'request_supplements'::regclass
              AND conname IN ('request_supplements_retired_spend_day_check', 'request_supplements_change_v2_check')
            ORDER BY conname`,
        );
        expect(checks.rows).toEqual([
          { conname: 'request_supplements_change_v2_check', convalidated: false },
          { conname: 'request_supplements_retired_spend_day_check', convalidated: false },
        ]);
        // Back in force for a new file: one that names a spend day is refused, as it was.
        expect(
          await sqlState(
            sql,
            `INSERT INTO request_supplements (id, organization_id, request_id, number, reason, changed_by_employee_id,
               before_expected_spend_on, after_expected_spend_on, before_amount_minor, after_amount_minor, currency)
             VALUES ($1, $2, $3, 3, 'Late', $4, '2026-10-01', '2026-11-01', 1, 2, 'VND')`,
            [randomUUID(), organizationId, requestId, employeeId],
          ),
        ).toBe('23514');
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS * 2 + 60_000,
  );
});
