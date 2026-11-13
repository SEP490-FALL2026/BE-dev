import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../../support/cli-process';
import { migrationEndingWith } from '../../support/migration-history';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();
const PRICES_TO_VNDS = migrationEndingWith('_fx_prices_to_vnd');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

interface SubscriptionRow {
  unit_price_minor: string;
  unit_price_currency: string;
  original_unit_price_minor: string | null;
  original_currency: string | null;
  price_rate: string;
  price_rate_date: string;
  price_rate_source: string;
  price_reporting_minor: string;
  price_reporting_currency: string;
  price_exchange_rate_id: string | null;
  status: string;
}

interface RequestRow {
  amount_minor: string | null;
  amount_currency: string | null;
  unit_price_minor: string | null;
  next_year_amount_minor: string | null;
}

/**
 * `QĐ-111an`, `R-4`, `S-1` (FX-1.1): the data migration that turns every price still held in a foreign currency into dong, once, at the
 * newest exchange rate on or before the day it runs (an exact half moves away from zero, ADR-0007), keeps the original price in two
 * columns, writes the snapshot of a price in dong (rate 1, `SAME_CURRENCY`) and an audit event of the system for each row it changes.
 * Real PostgreSQL: the migration file is run on a database that already holds the whole history, with rows as an earlier release
 * wrote them (foreign-currency prices are written by SQL: the routes no longer take one).
 */
describe('the migration that turns prices into dong (integration, real PostgreSQL)', () => {
  const sql = sqlOf(PRICES_TO_VNDS);
  let notices: string[] = [];
  let department: Department;
  let person: Person;

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-FX');
    person = await h.staff(department, 'FX-E1');
    h.ctx.sql.on('notice', (notice) => notices.push(notice.message ?? ''));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** Runs the migration and returns the notices it raised. */
  const migrate = async (): Promise<string[]> => {
    notices = [];
    await h.ctx.sql.query(sql);

    return notices;
  };
  const organizationId = () => h.seed.organizationId;

  /** A rate entered for a day: one for each currency and day (a second one for the same day is a no-op). */
  const rate = async (currency: string, day: string, value: string): Promise<string> => {
    await h.ctx.sql.query(
      `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, currency, rate_date) DO NOTHING`,
      [randomUUID(), organizationId(), currency, day, value],
    );

    return (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM exchange_rates WHERE organization_id = $1 AND currency = $2 AND rate_date = $3`,
        [organizationId(), currency, day],
      )
    ).rows[0].id;
  };

  /** A subscription as an earlier release wrote it: the price in its own currency with the snapshot converted at the rate of its day. */
  const subscription = async (input: {
    minor: bigint;
    currency: string;
    snapshot?: { rate: string; reportingMinor: bigint; exchangeRateId: string } | null;
    status?: 'ACTIVE' | 'DRAFT';
  }): Promise<string> => {
    const id = randomUUID();
    const planId = await h.plan('K2');
    const snapshot = input.snapshot === undefined ? null : input.snapshot;
    await h.ctx.sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, purchased_quantity,
         unit_price_minor, unit_price_currency, price_recorded_on,
         price_rate, price_rate_date, price_rate_source, price_reporting_minor, price_reporting_currency, price_exchange_rate_id,
         billing_cycle, commitment_term_months, start_date)
       VALUES ($1, $2, $3, $4, 'TERM', $5::"SubscriptionStatus", 10, $6, $7, '2026-09-01',
         $8, $9, $10::"PriceRateSource", $11, $12, $13, 'MONTHLY', 1, '2026-09-01')`,
      [
        id,
        organizationId(),
        planId,
        department.id,
        input.status ?? 'ACTIVE',
        input.minor.toString(),
        input.currency,
        snapshot?.rate ?? null,
        snapshot ? '2026-09-01' : null,
        snapshot ? 'MANUAL' : null,
        snapshot?.reportingMinor.toString() ?? null,
        snapshot ? 'VND' : null,
        snapshot?.exchangeRateId ?? null,
      ],
    );

    return id;
  };
  const subscriptionRow = async (id: string): Promise<SubscriptionRow> =>
    (
      await h.ctx.sql.query<SubscriptionRow>(
        `SELECT unit_price_minor::text, unit_price_currency, original_unit_price_minor::text, original_currency,
                price_rate::text, to_char(price_rate_date, 'YYYY-MM-DD') AS price_rate_date, price_rate_source::text,
                price_reporting_minor::text, price_reporting_currency, price_exchange_rate_id, status::text
           FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0];

  /** A paid request waiting to be sent on as spend, priced in a currency (what an earlier release held in the currency of the price). */
  const pricedRequest = async (
    currency: string,
    over: { amount: bigint; unit: bigint; nextYear?: bigint | null; withCommitment?: boolean },
  ): Promise<string> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO access_requests (id, organization_id, type, branch, state, plan_id, requester_employee_id, department_id, cost_center_id,
         business_reason, term_months, policy, created_by_app_user_id, pricing_status, amount_minor, amount_currency, unit_price_minor,
         billing_cycle, budget_year, next_year_amount_minor)
       VALUES ($1, $2, 'GRANT', 'PAID_IN_CATALOG', 'AWAITING_SPEND_SUBMISSION', $3, $4, $5, $6, 'Design', 6,
         '{"version":1}'::jsonb, $7, 'PRICED', $8, $9, $10, 'MONTHLY', 2026, $11)`,
      [
        id,
        organizationId(),
        await h.plan('K2'),
        person.employeeId,
        department.id,
        department.unitId,
        randomUUID(),
        over.amount.toString(),
        currency,
        over.unit.toString(),
        over.nextYear?.toString() ?? null,
      ],
    );
    if (over.withCommitment) {
      await h.ctx.sql.query(
        `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, unattached_reason)
         VALUES ($1, $2, $3, $4, 2026, $5, $6, 'NO_BUDGET')`,
        [randomUUID(), organizationId(), id, department.unitId, over.amount.toString(), currency],
      );
    }

    return id;
  };
  const requestRow = async (id: string): Promise<RequestRow> =>
    (
      await h.ctx.sql.query<RequestRow>(
        `SELECT amount_minor::text, amount_currency, unit_price_minor::text, next_year_amount_minor::text
           FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];

  const supplement = async (requestId: string, currency: string, before: bigint, after: bigint): Promise<string> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO request_supplements (id, organization_id, request_id, number, reason, changed_by_employee_id,
         before_amount_minor, after_amount_minor, currency, before_budget_year, after_budget_year)
       VALUES ($1, $2, $3, 1, 'One person left out', $4, $5, $6, $7, 2026, 2026)`,
      [id, organizationId(), requestId, person.employeeId, before.toString(), after.toString(), currency],
    );

    return id;
  };
  const supplementRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ before_amount_minor: string; after_amount_minor: string; currency: string }>(
        `SELECT before_amount_minor::text, after_amount_minor::text, currency FROM request_supplements WHERE id = $1`,
        [id],
      )
    ).rows[0];

  const auditOf = async (resourceId: string) =>
    (
      await h.ctx.sql.query<{
        action: string;
        actor_kind: string;
        actor_app_user_id: string | null;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
      }>(
        `SELECT action, actor_kind::text, actor_app_user_id, before, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id`,
        [resourceId],
      )
    ).rows;

  it('turns a price in dollars into dong at the newest rate (10.00 USD x 25.400 = 254.000), keeps the price it was and ends with a snapshot in dong', async () => {
    await rate('USD', '2026-08-01', '24000');
    const newest = await rate('USD', '2026-09-01', '25400');
    const id = await subscription({
      minor: 1000n,
      currency: 'USD',
      snapshot: { rate: '25400', reportingMinor: 254000n, exchangeRateId: newest },
    });

    await migrate();

    expect(await subscriptionRow(id)).toEqual({
      unit_price_minor: '254000',
      unit_price_currency: 'VND',
      original_unit_price_minor: '1000',
      original_currency: 'USD',
      price_rate: '1.0000000000',
      price_rate_date: '2026-09-01',
      price_rate_source: 'SAME_CURRENCY',
      price_reporting_minor: '254000',
      price_reporting_currency: 'VND',
      price_exchange_rate_id: null,
      status: 'ACTIVE',
    });
  });

  it('writes one audit event of the system for the row it converts, naming the price before and after, and none when it runs again', async () => {
    await rate('USD', '2026-09-01', '25400');
    const id = await subscription({ minor: 2500n, currency: 'USD', status: 'DRAFT' });

    await migrate();
    const events = await auditOf(id);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'SUBSCRIPTION.UPDATED', actor_kind: 'SYSTEM', actor_app_user_id: null });
    expect(JSON.stringify(events[0].before)).toContain('2500 USD');
    expect(JSON.stringify(events[0].after)).toContain('635000 VND');

    await migrate();
    expect(await auditOf(id)).toHaveLength(1);
    expect((await subscriptionRow(id)).unit_price_minor).toBe('635000');
  });

  it('rounds an exact half away from zero (0.01 GBP x 31.250 = 312,5 -> 313) and leaves a status as it was', async () => {
    await rate('GBP', '2026-09-01', '31250');
    const id = await subscription({ minor: 1n, currency: 'GBP', status: 'DRAFT' });

    await migrate();

    expect(await subscriptionRow(id)).toMatchObject({ unit_price_minor: '313', status: 'DRAFT' });
  });

  it('leaves a price with no rate at all as it is, and says how many, and does not touch a price already in dong', async () => {
    const unconvertible = await subscription({ minor: 9999n, currency: 'CAD', status: 'DRAFT' });
    const inDong = await subscription({ minor: 600000n, currency: 'VND', snapshot: null, status: 'DRAFT' });

    const raised = await migrate();

    expect(await subscriptionRow(unconvertible)).toMatchObject({
      unit_price_minor: '9999',
      unit_price_currency: 'CAD',
      original_unit_price_minor: null,
    });
    expect(await subscriptionRow(inDong)).toMatchObject({
      unit_price_minor: '600000',
      original_unit_price_minor: null,
    });
    expect(await auditOf(unconvertible)).toHaveLength(0);
    expect(raised.some((message) => message.includes(unconvertible))).toBe(true);
  });

  it('converts a request not yet decided as spend (amount, unit price, the year after) and its supplementary file, and gives each an audit event', async () => {
    await rate('USD', '2026-09-01', '25400');
    const request = await pricedRequest('USD', { amount: 50000n, unit: 1000n, nextYear: 20000n });
    const file = await supplement(request, 'USD', 50000n, 40000n);

    await migrate();

    expect(await requestRow(request)).toEqual({
      amount_minor: '12700000',
      amount_currency: 'VND',
      unit_price_minor: '254000',
      next_year_amount_minor: '5080000',
    });
    expect(await supplementRow(file)).toEqual({
      before_amount_minor: '12700000',
      after_amount_minor: '10160000',
      currency: 'VND',
    });
    const events = (await auditOf(request)).filter((event) => event.action === 'ACCESS_REQUEST.REPRICED');
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every((event) => event.actor_kind === 'SYSTEM' && event.actor_app_user_id === null)).toBe(true);
  });

  it('leaves a request whose spend was decided in its currency: the commitment it holds is not touched', async () => {
    await rate('USD', '2026-09-01', '25400');
    const request = await pricedRequest('USD', { amount: 50000n, unit: 1000n, withCommitment: true });
    const file = await supplement(request, 'USD', 50000n, 40000n);

    await migrate();

    expect(await requestRow(request)).toMatchObject({ amount_minor: '50000', amount_currency: 'USD' });
    expect(await supplementRow(file)).toMatchObject({ before_amount_minor: '50000', currency: 'USD' });
    expect(
      (await h.ctx.sql.query(`SELECT currency FROM budget_commitments WHERE request_id = $1`, [request])).rows[0],
    ).toEqual({ currency: 'USD' });
  });

  it('converts the quote of an assessment, keeping the quote it was', async () => {
    await rate('USD', '2026-09-01', '25400');
    const requestId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO access_requests (id, organization_id, type, branch, state, requester_employee_id, department_id, cost_center_id,
         business_reason, term_months, policy, created_by_app_user_id, pricing_status, price_missing_reason, budget_year)
       VALUES ($1, $2, 'GRANT', 'NEW_SOFTWARE', 'AWAITING_IT_ASSESSMENT', $3, $4, $5, 'Design', 6, '{"version":1}'::jsonb, $6,
         'MISSING', 'NO_PRICED_SUBSCRIPTION', 2026)`,
      [requestId, organizationId(), person.employeeId, department.id, department.unitId, randomUUID()],
    );
    await h.ctx.sql.query(
      `INSERT INTO access_request_assessments (request_id, status, quote_unit_price_minor, quote_currency, quote_billing_cycle, quote_valid_from)
       VALUES ($1, 'DRAFT', 800, 'USD', 'MONTHLY', '2026-01-01')`,
      [requestId],
    );

    await migrate();

    expect(
      (
        await h.ctx.sql.query(
          `SELECT quote_unit_price_minor::text, quote_currency, quote_original_unit_price_minor::text, quote_original_currency
             FROM access_request_assessments WHERE request_id = $1`,
          [requestId],
        )
      ).rows[0],
    ).toEqual({
      quote_unit_price_minor: '203200',
      quote_currency: 'VND',
      quote_original_unit_price_minor: '800',
      quote_original_currency: 'USD',
    });
  });

  it('stops, and changes nothing, when an organization reports in a currency other than dong', async () => {
    await rate('USD', '2026-09-01', '25400');
    const id = await subscription({ minor: 1234n, currency: 'USD', status: 'DRAFT' });

    // The organization is one row whose currency is locked once rates exist: the test turns the lock off for one transaction, then undoes it.
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query(`ALTER TABLE organizations DISABLE TRIGGER organizations_reporting_currency_locked`);
      await h.ctx.sql.query(`UPDATE organizations SET reporting_currency = 'USD'`);
      await expect(h.ctx.sql.query(sql)).rejects.toThrow(/reporting currency/i);
    } finally {
      await h.ctx.sql.query('ROLLBACK');
    }

    expect(await subscriptionRow(id)).toMatchObject({ unit_price_currency: 'USD', unit_price_minor: '1234' });
    expect(
      (await h.ctx.sql.query<{ reporting_currency: string }>(`SELECT reporting_currency FROM organizations`)).rows[0],
    ).toEqual({ reporting_currency: 'VND' });
  });
});
