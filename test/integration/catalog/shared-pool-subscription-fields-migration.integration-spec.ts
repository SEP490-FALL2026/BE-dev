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

const TARGET = migrationEndingWith('_shared_pool_subscription_fields');
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
 * QĐ-103e, QĐ-103v(4), Q-04: the migration that gives a subscription its commitment, its IT Admin, the vendor's minimum and the
 * flag of the subscription that prices its plan, on an installation that already holds subscriptions. The history before it is
 * replayed, subscriptions are written the way they were, and then the migration runs.
 */
describe('the migration of the shared-pool fields of a subscription (integration, real PostgreSQL)', () => {
  it(
    'gives an existing term a month or a year by how it is paid, a K1 plan a month, and a perpetual purchase none; the cycle enum is not touched',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
        const organizationId = randomUUID();
        await sql.query(
          `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
          [organizationId],
        );
        const departmentId = randomUUID();
        await sql.query(
          `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'P-OWNER', 'Owner', now())`,
          [departmentId, organizationId],
        );
        const ownerId = randomUUID();
        await sql.query(
          `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
         VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
          [ownerId, organizationId],
        );
        const plan = async (
          kind: string,
          name: string,
          type: string,
          pricing: string | null,
          control: string | null,
        ) => {
          const vendorId = randomUUID();
          await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $3)`, [
            vendorId,
            organizationId,
            `${name} vendor`,
          ]);
          const applicationId = randomUUID();
          await sql.query(
            `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
             data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
           VALUES ($1, $2, $3::"ApplicationKind", $4, $5, $5, $6, 'LOW', false, false, false, false)`,
            [applicationId, organizationId, kind, vendorId, name, ownerId],
          );
          const planId = randomUUID();
          await sql.query(
            `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
           VALUES ($1, $2, $3, $4, $4, $5::"ProvisioningType", $6::"PricingModel", $7::"ControlLevel")`,
            [planId, organizationId, applicationId, `${name} plan`, type, pricing, control],
          );

          return planId;
        };
        const subscription = async (planId: string, kind: string, billingCycle: string | null) => {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, billing_cycle)
           VALUES ($1, $2, $3, $4, $5::"SubscriptionKind", 'DRAFT', $6::"BillingCycle")`,
            [id, organizationId, planId, departmentId, kind, billingCycle],
          );

          return id;
        };
        const k2 = await plan('SAAS', 'Figma', 'K2', 'PER_SEAT', 'FULL');
        const k1 = await plan('SAAS', 'Zoom', 'K1', 'FLAT_RATE', 'PARTIAL');
        const k4 = await plan('LICENSED', 'Office', 'K4', 'PER_SEAT', 'FULL');
        const monthly = await subscription(k2, 'TERM', 'MONTHLY');
        const annual = await subscription(k2, 'TERM', 'ANNUAL');
        const quarterly = await subscription(k2, 'TERM', 'QUARTERLY');
        const other = await subscription(k2, 'TERM', 'OTHER');
        const k1Annual = await subscription(k1, 'TERM', 'ANNUAL');
        const perpetual = await subscription(k4, 'PERPETUAL', null);

        await sql.query(sqlOf(TARGET));

        const commitment = async (id: string) =>
          (
            await sql.query<{ commitment_term_months: number | null; billing_cycle: string | null; primary: boolean }>(
              `SELECT commitment_term_months, billing_cycle, is_primary_for_plan AS "primary" FROM subscriptions WHERE id = $1`,
              [id],
            )
          ).rows[0];
        expect(await commitment(monthly)).toMatchObject({ commitment_term_months: 1, billing_cycle: 'MONTHLY' });
        expect(await commitment(annual)).toMatchObject({ commitment_term_months: 12, billing_cycle: 'ANNUAL' });
        // The cycle is not relabeled: a price is per cycle, and a quarterly price read as annual would be wrong.
        expect(await commitment(quarterly)).toMatchObject({ commitment_term_months: 12, billing_cycle: 'QUARTERLY' });
        expect(await commitment(other)).toMatchObject({ commitment_term_months: 12, billing_cycle: 'OTHER' });
        expect(await commitment(k1Annual)).toMatchObject({ commitment_term_months: 1, billing_cycle: 'ANNUAL' });
        expect(await commitment(perpetual)).toMatchObject({ commitment_term_months: null, primary: false });

        // The constraints are in force.
        const set = (column: string, value: unknown, id: string) =>
          sqlState(sql, `UPDATE subscriptions SET ${column} = $1 WHERE id = $2`, [value, id]);
        expect(await set('commitment_term_months', 6, monthly)).toBe('23514');
        expect(await set('commitment_term_months', 12, perpetual)).toBe('23514');
        expect(await set('vendor_minimum_seats', 0, monthly)).toBe('23514');
        expect(await set('vendor_minimum_seats', 5, monthly)).toBeNull();
        expect(await set('responsible_it_admin_employee_id', randomUUID(), monthly)).toBe('23503');
        expect(await set('responsible_it_admin_employee_id', ownerId, monthly)).toBeNull();
        expect(await set('is_primary_for_plan', true, monthly)).toBeNull();
        expect(await set('is_primary_for_plan', true, annual)).toBe('23505');
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS + 60_000,
  );
});
