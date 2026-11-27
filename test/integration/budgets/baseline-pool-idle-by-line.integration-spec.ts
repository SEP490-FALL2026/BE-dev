import request from 'supertest';
import { SpendHarness, type Unit } from '../../support/spend-harness';

const h = new SpendHarness();

interface Money {
  amount: string;
}
interface BaselineWire {
  departments: {
    departmentId: string;
    estimatedAnnualCost: Money;
    software: {
      subscriptionId: string;
      planId: string;
      application: string;
      plan: string;
      seatsPurchased: number | null;
      seatsAssigned: number;
      monthlyUnitPrice: Money | null;
      estimatedAnnualCost: Money | null;
    }[];
  }[];
  sharedPoolUnallocated: {
    estimatedAnnualCost: Money;
    seatsIdle: number;
    softwareTotal: number;
    software: {
      subscriptionId: string;
      planId: string;
      application: string;
      plan: string;
      seatsPurchased: number;
      seatsAssigned: number;
      seatsIdle: number;
      monthlyUnitPrice: Money | null;
      estimatedAnnualCost: Money | null;
    }[];
  } | null;
}

/**
 * A K2 period with two plans, each its own line with its own seats in the ledger: Standard 10 seats at 500.000 and Premium 5 seats at
 * 800.000. The department holds 3 Standard and 2 Premium. The idle seats of each plan are charged at the line of that plan.
 */
describe('the baseline of a period with two plans: a row for each plan, the idle seats at the line of the plan (integration, real PostgreSQL)', () => {
  let unit: Unit;
  let subscriptionId: string;
  let standardPlanId: string;
  let premiumPlanId: string;
  const baselineOf = async () =>
    h.dataOf<BaselineWire>(
      await request(h.server()).get(`/api/v1/budget-cycles/${h.year}/baseline`).set(h.as(h.finance)).expect(200),
    );
  const seatOf = async (employeeId: string, planId: string) => {
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id, granted_on)
       SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', $2, $3, e.id, e.employee_code || '@acme.vn',
              lower(e.employee_code) || '@acme.vn', $4::date, 'ACTUAL', gen_random_uuid(), $4::date
         FROM employees e WHERE e.id = $1`,
      [employeeId, planId, subscriptionId, `${h.year}-01-05`],
    );
  };
  const openLedger = async (lineId: string, seats: number) => {
    await h.ctx.sql.query(`UPDATE subscription_lines SET ledger_opened_on = '2026-01-05' WHERE id = $1`, [lineId]);
    await h.ctx.sql.query(
      `INSERT INTO seat_changes (id, organization_id, subscription_line_id, effective_on, delta, reason, source, basis)
       SELECT gen_random_uuid(), organization_id, id, '2026-01-05', $2, 'INITIAL', 'ADJUSTMENT', 'NONE'
         FROM subscription_lines WHERE id = $1`,
      [lineId, seats],
    );
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.departmentWithHead('P-PI1');
    subscriptionId = await h.subscription(10, 'K2');
    standardPlanId = (
      await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId])
    ).rows[0].plan_id;
    // The line of the declared plan keeps the ledger of its 10 seats the declaration opened.
    await h.ctx.sql.query(
      `UPDATE subscription_lines SET monthly_unit_price_minor = 500000 WHERE subscription_id = $1`,
      [subscriptionId],
    );
    // The second plan belongs to another application of the same vendor (a period binds the vendor, not the application).
    premiumPlanId = (
      await h.ctx.sql.query<{ id: string }>(
        `WITH app AS (
           INSERT INTO applications (id, organization_id, kind, vendor_id, functional_group_id, name, normalized_name,
             responsible_it_admin_employee_id)
           SELECT gen_random_uuid(), a.organization_id, a.kind, a.vendor_id, a.functional_group_id, 'Premium app idle',
                  'premium app idle', a.responsible_it_admin_employee_id
             FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1
           RETURNING id
         )
         INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding)
         SELECT gen_random_uuid(), organization_id, (SELECT id FROM app), 'Premium idle', 'premium idle', provisioning_type,
                pricing_model, control_level, key_binding
           FROM plans WHERE id = $1
         RETURNING id`,
        [standardPlanId],
      )
    ).rows[0].id;
    const premiumLineId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO subscription_lines (id, organization_id, subscription_id, workspace_id, plan_id, monthly_unit_price_minor, updated_at)
         SELECT gen_random_uuid(), organization_id, id, workspace_id, $2, 800000, now() FROM subscriptions WHERE id = $1
         RETURNING id`,
        [subscriptionId, premiumPlanId],
      )
    ).rows[0].id;
    await openLedger(premiumLineId, 5);
    // The department holds 3 Standard and 2 Premium.
    await seatOf((await h.staff(unit.department, 'PI1-S1')).employeeId, standardPlanId);
    await seatOf((await h.staff(unit.department, 'PI1-S2')).employeeId, standardPlanId);
    await seatOf((await h.staff(unit.department, 'PI1-P1')).employeeId, premiumPlanId);
    await seatOf((await h.staff(unit.department, 'PI1-S3')).employeeId, standardPlanId);
    await seatOf((await h.staff(unit.department, 'PI1-P2')).employeeId, premiumPlanId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('charges the idle seats of each plan at its own line: 7 Standard at 500.000 and 3 Premium at 800.000 = 5.900.000 a month', async () => {
    const pool = (await baselineOf()).sharedPoolUnallocated;

    expect(pool?.seatsIdle).toBe(10);
    expect(pool?.estimatedAnnualCost.amount).toBe('70800000');
    expect(pool?.software.find((row) => row.planId === premiumPlanId)?.application).toBe('Premium app idle');
  });

  it('lists a row for each plan the department holds: its seats, its line price and its year, 3 x 500.000 x 12 and 2 x 800.000 x 12', async () => {
    const department = (await baselineOf()).departments.find((row) => row.departmentId === unit.department.id);
    const rows = (department?.software ?? [])
      .filter((row) => row.subscriptionId === subscriptionId)
      .sort((a, b) => Number(a.monthlyUnitPrice?.amount) - Number(b.monthlyUnitPrice?.amount));

    expect(
      rows.map((row) => [
        row.planId,
        row.seatsPurchased,
        row.seatsAssigned,
        row.monthlyUnitPrice?.amount,
        row.estimatedAnnualCost?.amount,
      ]),
    ).toEqual([
      [standardPlanId, 10, 3, '500000', '18000000'],
      [premiumPlanId, 5, 2, '800000', '19200000'],
    ]);
    expect(rows.map((row) => row.plan)).toEqual([expect.any(String), 'Premium idle']);
    // Each row names the application of its own plan, not the one of the plan of the period.
    expect(rows[1].application).toBe('Premium app idle');
    expect(rows[0].application).not.toBe('Premium app idle');
    expect(department?.estimatedAnnualCost.amount).toBe('37200000');
  });
});
