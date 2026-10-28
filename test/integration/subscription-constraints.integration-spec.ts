import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

interface SubscriptionInput {
  planId?: string;
  kind?: 'TERM' | 'PERPETUAL';
  status?: 'DRAFT' | 'ACTIVE';
  quantity?: number | null;
  price?: { minor: bigint; currency: string } | null;
  snapshot?: boolean;
  billingCycle?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  renewalDate?: string | null;
  noticeDeadline?: string | null;
  noticePeriodDays?: number | null;
  autoRenew?: boolean;
  allowsReduction?: boolean;
  reportingMinor?: bigint | null;
  exchangeRateId?: string | null;
}

describe('subscriptions (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let ownerId: string;
  let perSeatPlan: string;
  let flatPlan: string;
  let licensedPlan: string;
  let internalPlan: string;
  let rateId: string;

  const insert = (input: SubscriptionInput) => {
    const price = input.price === undefined ? { minor: 120000n, currency: 'USD' } : input.price;
    const snapshot = input.snapshot ?? price !== null;

    return sqlState(
      sql,
      `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, purchased_quantity,
         unit_price_minor, unit_price_currency, price_recorded_on,
         price_rate, price_rate_date, price_rate_source, price_reporting_minor, price_reporting_currency, price_exchange_rate_id,
         billing_cycle, start_date, end_date, renewal_date, notice_deadline, notice_period_days, auto_renew, allows_mid_term_reduction)
       VALUES ($1, $2, $3, (SELECT id FROM departments WHERE organization_id = $2 LIMIT 1), $4::"SubscriptionKind", $5::"SubscriptionStatus", $6,
         $7, $8, $9,
         $10, $11, $12::"PriceRateSource", $13, $14, $15,
         $16::"BillingCycle", $17, $18, $19, $20, $21, $22, $23)`,
      [
        randomUUID(),
        organizationId,
        input.planId ?? perSeatPlan,
        input.kind ?? 'TERM',
        input.status ?? 'DRAFT',
        input.quantity === undefined ? null : input.quantity,
        price?.minor.toString() ?? null,
        price?.currency ?? null,
        price ? '2026-09-01' : null,
        snapshot ? '25000' : null,
        snapshot ? '2026-09-01' : null,
        snapshot ? 'MANUAL' : null,
        snapshot ? (input.reportingMinor === undefined ? '3000000000' : input.reportingMinor) : null,
        snapshot ? 'VND' : null,
        snapshot ? (input.exchangeRateId === undefined ? rateId : input.exchangeRateId) : null,
        input.billingCycle === undefined ? null : input.billingCycle,
        input.startDate === undefined ? null : input.startDate,
        input.endDate === undefined ? null : input.endDate,
        input.renewalDate === undefined ? null : input.renewalDate,
        input.noticeDeadline === undefined ? null : input.noticeDeadline,
        input.noticePeriodDays === undefined ? null : input.noticePeriodDays,
        input.autoRenew ?? false,
        input.allowsReduction ?? false,
      ],
    );
  };
  const complete = (extra: SubscriptionInput = {}): SubscriptionInput => ({
    status: 'ACTIVE',
    quantity: 100,
    billingCycle: 'ANNUAL',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    ...extra,
  });
  const newPlan = async (
    kind: string,
    name: string,
    type: string,
    pricing: string | null,
    control: string | null,
  ): Promise<string> => {
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
      [applicationId, organizationId, kind, kind === 'INTERNAL' ? null : vendorId, name, ownerId],
    );
    const planId = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, $4, $4, $5::"ProvisioningType", $6::"PricingModel", $7::"ControlLevel")`,
      [planId, organizationId, applicationId, `${name} plan`, type, pricing, control],
    );

    return planId;
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    organizationId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [organizationId],
    );
    // A subscription always has the department that owns it (F02): one department stands for all of them.
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at)
       VALUES (gen_random_uuid(), $1, 'P-OWNER', 'The department that owns the subscriptions', now())`,
      [organizationId],
    );
    ownerId = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
      [ownerId, organizationId],
    );
    rateId = randomUUID();
    await sql.query(
      `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate) VALUES ($1, $2, 'USD', '2026-09-01', 25000)`,
      [rateId, organizationId],
    );
    perSeatPlan = await newPlan('SAAS', 'Figma', 'K2', 'PER_SEAT', 'FULL');
    flatPlan = await newPlan('SAAS', 'Zoom', 'K1', 'FLAT_RATE', 'PARTIAL');
    licensedPlan = await newPlan('LICENSED', 'Office', 'K4', 'PER_SEAT', 'FULL');
    internalPlan = await newPlan('INTERNAL', 'Portal', 'K5', null, null);
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('stores a draft with nothing known and a complete subscription', async () => {
    expect(await insert({ price: null })).toBeNull();
    expect(await insert(complete())).toBeNull();
  });

  it('holds the price fields together or none of them, and the conversion snapshot together or none of it (INV-04)', async () => {
    const bare = (columns: string, values: unknown[]) =>
      sqlState(
        sql,
        `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, ${columns})
         VALUES ($1, $2, $3, (SELECT id FROM departments WHERE organization_id = $2 LIMIT 1), 'TERM', 'DRAFT', ${values.map((_, index) => `$${index + 4}`).join(', ')})`,
        [randomUUID(), organizationId, perSeatPlan, ...values],
      );

    expect(await bare('unit_price_minor, unit_price_currency', [100, 'USD'])).toBe('23514');
    expect(await bare('unit_price_minor, price_recorded_on', [100, '2026-09-01'])).toBe('23514');
    expect(await bare('price_rate, price_rate_date', [25000, '2026-09-01'])).toBe('23514');
    expect(await insert({ snapshot: false })).toBeNull();
    expect(await insert({ reportingMinor: null })).toBe('23514');
  });

  it('keeps the price between 0 and 10^15 minor units and the converted value between 0 and 10^18', async () => {
    expect(await insert({ price: { minor: 0n, currency: 'USD' } })).toBeNull();
    expect(await insert({ price: { minor: 10n ** 15n, currency: 'USD' } })).toBeNull();
    expect(await insert({ price: { minor: -1n, currency: 'USD' } })).toBe('23514');
    expect(await insert({ price: { minor: 10n ** 15n + 1n, currency: 'USD' } })).toBe('23514');
    expect(await insert({ reportingMinor: 10n ** 18n })).toBeNull();
    expect(await insert({ reportingMinor: 10n ** 18n + 1n })).toBe('23514');
    expect(await insert({ reportingMinor: -1n })).toBe('23514');
  });

  it('refuses a currency that is not in the table and an exchange rate that does not exist (foreign keys)', async () => {
    expect(await insert({ price: { minor: 100n, currency: 'XYZ' }, snapshot: false })).toBe('23503');
    expect(await insert({ exchangeRateId: randomUUID() })).toBe('23503');
  });

  it('keeps the dates in order: start before end, renewal at most a day after the end, notice before renewal', async () => {
    expect(await insert({ price: null, startDate: '2026-01-01', endDate: '2026-12-31' })).toBeNull();
    expect(await insert({ price: null, startDate: '2026-01-01', endDate: '2026-01-01' })).toBeNull();
    expect(await insert({ price: null, startDate: '2026-12-31', endDate: '2026-01-01' })).toBe('23514');
    expect(await insert({ price: null, endDate: '2026-12-31', renewalDate: '2027-01-01' })).toBeNull();
    expect(await insert({ price: null, endDate: '2026-12-31', renewalDate: '2027-01-02' })).toBe('23514');
    expect(await insert({ price: null, renewalDate: '2026-12-31', noticeDeadline: '2026-12-01' })).toBeNull();
    expect(await insert({ price: null, renewalDate: '2026-12-01', noticeDeadline: '2026-12-31' })).toBe('23514');
  });

  it('gives a perpetual purchase no term at all: no end, renewal, notice, cycle, auto renewal or mid-term reduction (QĐ-49c)', async () => {
    const perpetual = (extra: SubscriptionInput) =>
      insert({ kind: 'PERPETUAL', planId: licensedPlan, price: null, startDate: '2026-03-15', quantity: 50, ...extra });

    expect(await perpetual({})).toBeNull();
    expect(await perpetual({ endDate: '2027-01-01' })).toBe('23514');
    expect(await perpetual({ renewalDate: '2027-01-01' })).toBe('23514');
    expect(await perpetual({ noticeDeadline: '2026-12-01' })).toBe('23514');
    expect(await perpetual({ noticePeriodDays: 30 })).toBe('23514');
    expect(await perpetual({ billingCycle: 'ANNUAL' })).toBe('23514');
    expect(await perpetual({ autoRenew: true })).toBe('23514');
    expect(await perpetual({ allowsReduction: true })).toBe('23514');
  });

  it('is active only with its data complete: a start date, a price with its snapshot, a cycle for a term, a quantity for a purchase', async () => {
    expect(await insert(complete({ startDate: null }))).toBe('23514');
    expect(await insert(complete({ price: null }))).toBe('23514');
    expect(await insert(complete({ snapshot: false }))).toBe('23514');
    expect(await insert(complete({ billingCycle: null }))).toBe('23514');
    expect(
      await insert({
        kind: 'PERPETUAL',
        planId: licensedPlan,
        status: 'ACTIVE',
        quantity: null,
        startDate: '2026-03-15',
      }),
    ).toBe('23514');
    expect(
      await insert({
        kind: 'PERPETUAL',
        planId: licensedPlan,
        status: 'ACTIVE',
        quantity: 50,
        startDate: '2026-03-15',
      }),
    ).toBeNull();
  });

  it('makes a per-seat plan need the quantity to be active, and lets a flat-rate plan do without (trigger)', async () => {
    expect(await insert(complete({ quantity: null }))).toBe('23514');
    expect(await insert(complete({ quantity: null, planId: flatPlan }))).toBeNull();
    expect(await insert({ price: null, quantity: null })).toBeNull();
  });

  it('gives an internal application no subscription, and allows a perpetual purchase for licensed software only (trigger)', async () => {
    expect(await insert({ price: null, planId: internalPlan })).toBe('23514');
    expect(await insert({ price: null, kind: 'PERPETUAL', planId: perSeatPlan, startDate: '2026-03-15' })).toBe(
      '23514',
    );
    expect(await insert({ price: null, kind: 'PERPETUAL', planId: licensedPlan, startDate: '2026-03-15' })).toBeNull();
  });

  it('refuses a subscription for a plan that does not exist (foreign key)', async () => {
    expect(await insert({ price: null, planId: randomUUID() })).toBe('23503');
  });

  it('refuses a quantity below zero', async () => {
    expect(await insert({ price: null, quantity: -1 })).toBe('23514');
    expect(await insert({ price: null, quantity: 0 })).toBeNull();
  });
});
