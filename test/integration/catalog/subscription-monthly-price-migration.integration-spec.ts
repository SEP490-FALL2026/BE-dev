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

const TARGET = migrationEndingWith('_w3_monthly_price');
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

async function seedCatalogFixture(sql: Client) {
  const organizationId = randomUUID();
  await sql.query(
    `INSERT INTO currencies (code, name, minor_unit)
     VALUES ('VND', 'Vietnamese Dong', 0), ('USD', 'US Dollar', 2)
     ON CONFLICT (code) DO NOTHING`,
  );
  await sql.query(
    `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
    [organizationId],
  );
  const functionalGroupId = randomUUID();
  await sql.query(
    `INSERT INTO functional_groups (id, organization_id, name, normalized_name) VALUES ($1, $2, 'General', 'general')`,
    [functionalGroupId, organizationId],
  );
  const itAdminId = randomUUID();
  await sql.query(
    `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
     VALUES ($1, $2, 'IT-1', 'IT Admin One', 'STAFF', '2026-01-01', now())`,
    [itAdminId, organizationId],
  );

  const createPlan = async (name: string, type: 'K1' | 'K2' | 'K4') => {
    const vendorId = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $3)`, [
      vendorId,
      organizationId,
      `${name} vendor`,
    ]);
    const applicationId = randomUUID();
    const appKind = type === 'K4' ? 'LICENSED' : 'SAAS';
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, functional_group_id, name, normalized_name, responsible_it_admin_employee_id)
       VALUES ($1, $2, $3::"ApplicationKind", $4, $5, $6, $6, $7)`,
      [applicationId, organizationId, appKind, vendorId, functionalGroupId, name, itAdminId],
    );
    const planId = randomUUID();
    const pricingModel = type === 'K4' ? null : 'PER_SEAT';
    const keyBinding = type === 'K4' ? 'ACCOUNT' : null;
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding)
       VALUES ($1, $2, $3, $4, $4, $5::"ProvisioningType", $6::"PricingModel", 'FULL'::"ControlLevel", $7::"PlanKeyBinding")`,
      [planId, organizationId, applicationId, `${name} plan`, type, pricingModel, keyBinding],
    );

    return planId;
  };

  const insertSubscription = async (input: {
    planId: string;
    kind: 'TERM' | 'PERPETUAL';
    status: 'DRAFT' | 'ACTIVE';
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null;
    unitPriceMinor: string | null;
    unitPriceCurrency: string | null;
    commitmentTermMonths?: number | null;
    isPrimary?: boolean;
  }) => {
    const id = randomUUID();
    const hasPrice = input.unitPriceMinor !== null && input.unitPriceCurrency !== null;
    await sql.query(
      `INSERT INTO subscriptions (
         id, organization_id, plan_id, kind, status, purchased_quantity,
         unit_price_minor, unit_price_currency, price_recorded_on,
         price_rate, price_rate_date, price_rate_source, price_reporting_minor, price_reporting_currency,
         billing_cycle, commitment_term_months, start_date, responsible_it_admin_employee_id, is_primary_for_plan
       ) VALUES (
         $1, $2, $3, $4::"SubscriptionKind", $5::"SubscriptionStatus", $6,
         $7, $8, $9,
         $10, $11, $12::"PriceRateSource", $13, $14,
         $15::"BillingCycle", $16, $17, $18, $19
       )`,
      [
        id,
        organizationId,
        input.planId,
        input.kind,
        input.status,
        input.status === 'ACTIVE' ? 5 : null,
        input.unitPriceMinor,
        input.unitPriceCurrency,
        hasPrice ? '2026-10-01' : null,
        hasPrice ? '1.0000000000' : null,
        hasPrice ? '2026-10-01' : null,
        hasPrice ? 'SAME_CURRENCY' : null,
        hasPrice && input.unitPriceCurrency === 'VND' ? input.unitPriceMinor : null,
        hasPrice && input.unitPriceCurrency === 'VND' ? 'VND' : null,
        input.billingCycle,
        input.commitmentTermMonths ?? null,
        input.status === 'ACTIVE' ? '2026-10-01' : null,
        input.status === 'ACTIVE' ? itAdminId : null,
        input.isPrimary ?? false,
      ],
    );

    return id;
  };

  return { createPlan, insertSubscription };
}

/**
 * W3-02 M1 migration (`20261201000000_w3_monthly_price`): verifies round-half-up backfill of `monthly_unit_price_minor`,
 * backfill of `plans.reference_commitment_months`, pre-check guards, and post-backfill CHECK constraints.
 */
describe('M1 w3_monthly_price migration (integration, real PostgreSQL)', () => {
  it(
    'backfills monthly_unit_price_minor and reference_commitment_months, then enforces post-backfill CHECK constraints',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying history failed: ${before.stdout}`);

        const { createPlan, insertSubscription } = await seedCatalogFixture(sql);
        const k1 = await createPlan('K1 App', 'K1');
        const k2Annual = await createPlan('K2 Annual App', 'K2');
        const k2Monthly = await createPlan('K2 Monthly App', 'K2');
        const k2Quarterly = await createPlan('K2 Quarterly App', 'K2');
        const k2Draft = await createPlan('K2 Draft App', 'K2');
        const k4 = await createPlan('K4 App', 'K4');

        const subAnnual = await insertSubscription({
          planId: k2Annual,
          kind: 'TERM',
          status: 'ACTIVE',
          billingCycle: 'ANNUAL',
          unitPriceMinor: '6000000',
          unitPriceCurrency: 'VND',
          commitmentTermMonths: 12,
          isPrimary: true,
        });
        const subMonthly = await insertSubscription({
          planId: k2Monthly,
          kind: 'TERM',
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          unitPriceMinor: '375000',
          unitPriceCurrency: 'VND',
          commitmentTermMonths: 1,
        });
        const subQuarterly = await insertSubscription({
          planId: k2Quarterly,
          kind: 'TERM',
          status: 'ACTIVE',
          billingCycle: 'QUARTERLY',
          unitPriceMinor: '900001',
          unitPriceCurrency: 'VND',
          commitmentTermMonths: 12,
        });
        const subDraftNoPrice = await insertSubscription({
          planId: k2Draft,
          kind: 'TERM',
          status: 'DRAFT',
          billingCycle: 'ANNUAL',
          unitPriceMinor: null,
          unitPriceCurrency: null,
        });
        const subPerpetual = await insertSubscription({
          planId: k4,
          kind: 'PERPETUAL',
          status: 'ACTIVE',
          billingCycle: null,
          unitPriceMinor: '3500000',
          unitPriceCurrency: 'VND',
        });

        await sql.query(sqlOf(TARGET));

        const monthlyOf = async (id: string) =>
          (
            await sql.query<{ monthly_unit_price_minor: string | null }>(
              `SELECT monthly_unit_price_minor::text FROM subscriptions WHERE id = $1`,
              [id],
            )
          ).rows[0]?.monthly_unit_price_minor;

        expect(await monthlyOf(subAnnual)).toBe('500000');
        expect(await monthlyOf(subMonthly)).toBe('375000');
        expect(await monthlyOf(subQuarterly)).toBe('300000');
        expect(await monthlyOf(subDraftNoPrice)).toBeNull();
        expect(await monthlyOf(subPerpetual)).toBeNull();

        const planCommitmentOf = async (id: string) =>
          (
            await sql.query<{ reference_commitment_months: number | null }>(
              `SELECT reference_commitment_months FROM plans WHERE id = $1`,
              [id],
            )
          ).rows[0]?.reference_commitment_months;

        expect(await planCommitmentOf(k1)).toBe(1);
        expect(await planCommitmentOf(k2Annual)).toBe(12);
        expect(await planCommitmentOf(k2Monthly)).toBeNull();
        expect(await planCommitmentOf(k4)).toBeNull();

        expect(
          await sqlState(sql, `UPDATE subscriptions SET monthly_unit_price_minor = -1 WHERE id = $1`, [subAnnual]),
        ).toBe('23514');
        expect(
          await sqlState(sql, `UPDATE subscriptions SET monthly_unit_price_minor = NULL WHERE id = $1`, [subAnnual]),
        ).toBe('23514');
        expect(await sqlState(sql, `UPDATE plans SET reference_commitment_months = 6 WHERE id = $1`, [k2Annual])).toBe(
          '23514',
        );
        expect(await sqlState(sql, `UPDATE plans SET reference_commitment_months = 12 WHERE id = $1`, [k4])).toBe(
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

  it(
    'stops with RAISE EXCEPTION naming the subscription id when an ACTIVE TERM row has billing_cycle = OTHER',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying history failed: ${before.stdout}`);

        const { createPlan, insertSubscription } = await seedCatalogFixture(sql);
        const k2 = await createPlan('K2 Other App', 'K2');
        const badId = await insertSubscription({
          planId: k2,
          kind: 'TERM',
          status: 'ACTIVE',
          billingCycle: 'OTHER',
          unitPriceMinor: '500000',
          unitPriceCurrency: 'VND',
          commitmentTermMonths: 12,
        });

        await expect(sql.query(sqlOf(TARGET))).rejects.toThrow(badId);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS + 60_000,
  );

  it(
    'stops with RAISE EXCEPTION naming the subscription id when a TERM row has non-VND currency',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying history failed: ${before.stdout}`);

        const { createPlan, insertSubscription } = await seedCatalogFixture(sql);
        const k2 = await createPlan('K2 USD App', 'K2');
        const badId = await insertSubscription({
          planId: k2,
          kind: 'TERM',
          status: 'DRAFT',
          billingCycle: 'ANNUAL',
          unitPriceMinor: '12000',
          unitPriceCurrency: 'USD',
        });

        await expect(sql.query(sqlOf(TARGET))).rejects.toThrow(badId);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS + 60_000,
  );
});
