import request from 'supertest';
import { RunningUncommittedFactsService } from '../../../src/modules/budgets/running-uncommitted/running-uncommitted-facts.service';
import { SpendHarness, type Unit } from '../../support/spend-harness';

const h = new SpendHarness();

interface BaselineWire {
  departments: {
    departmentId: string;
    estimatedAnnualCost: { amount: string };
    software: {
      subscriptionId: string;
      monthsRunning: number;
      monthlyUnitPrice: { amount: string } | null;
      estimatedAnnualCost: { amount: string } | null;
    }[];
  }[];
}

/**
 * A period with plan lines prices a seat by the line that serves the seat's plan, never by the price columns of the period
 * (the columns of a period with lines are only a record: a line is edited through the line). The period here carries a stale
 * column price (1.000.000) next to two lines: Standard 500.000 and Premium 800.000.
 */
describe('price of a seat of a period with lines in the running uncommitted cost and the baseline (integration, real PostgreSQL)', () => {
  let unit: Unit;
  let subscriptionId: string;
  let standardLineId: string;
  let premiumLineId: string;
  let premiumPlanId: string;
  const today = () => h.today();
  const costOfYear = async (): Promise<bigint> => {
    const facts = h.ctx.app.get(RunningUncommittedFactsService, { strict: false });
    const totals = await facts.ofYear(h.year, today());

    return totals.get(unit.department.unitId) ?? 0n;
  };
  const patchLinePrice = async (lineId: string, amount: string): Promise<void> => {
    const { rows } = await h.ctx.sql.query<{ updated_at: Date }>(
      `SELECT updated_at FROM subscription_lines WHERE id = $1`,
      [lineId],
    );
    await request(h.server())
      .patch(`/api/v1/subscription-lines/${lineId}`)
      .set(h.as(h.it1))
      .send({ monthlyUnitPrice: { amount, currency: 'VND' }, expectedUpdatedAt: rows[0].updated_at.toISOString() })
      .expect(200);
  };
  const baselineOf = async () =>
    h.dataOf<BaselineWire>(
      await request(h.server())
        .get(`/api/v1/budget-cycles/${h.year}/baseline`)
        .query({ departmentId: unit.department.id })
        .set(h.as(h.finance))
        .expect(200),
    );

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.departmentWithHead('P-LP1');
    subscriptionId = await h.subscription(10, 'K2');
    const standardPlanId = (
      await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId])
    ).rows[0].plan_id;
    // The column of the period stays at 1.000.000: only the lines say what a seat costs.
    await h.ctx.sql.query(
      `UPDATE subscription_lines SET monthly_unit_price_minor = 500000 WHERE subscription_id = $1`,
      [subscriptionId],
    );
    standardLineId = (
      await h.ctx.sql.query<{ id: string }>(`SELECT id FROM subscription_lines WHERE subscription_id = $1`, [
        subscriptionId,
      ])
    ).rows[0].id;
    premiumPlanId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding)
         SELECT gen_random_uuid(), organization_id, application_id, 'Premium line price', 'premium line price', provisioning_type,
                pricing_model, control_level, key_binding
           FROM plans WHERE id = $1
         RETURNING id`,
        [standardPlanId],
      )
    ).rows[0].id;
    premiumLineId = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO subscription_lines (id, organization_id, subscription_id, workspace_id, plan_id, monthly_unit_price_minor, updated_at)
         SELECT gen_random_uuid(), organization_id, id, workspace_id, $2, 800000, now() FROM subscriptions WHERE id = $1
         RETURNING id`,
        [subscriptionId, premiumPlanId],
      )
    ).rows[0].id;
    const person = await h.staff(unit.department, 'LP1-PREMIUM');
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id, granted_on)
       SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', $2, $3, e.id, e.employee_code || '@acme.vn',
              lower(e.employee_code) || '@acme.vn', $4::date, 'ACTUAL', gen_random_uuid(), $4::date
         FROM employees e WHERE e.id = $1`,
      [person.employeeId, premiumPlanId, subscriptionId, `${h.year}-01-05`],
    );
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('prices a seat of the Premium plan with no Request at the Premium line (800.000 x 12), not at the column of the period', async () => {
    expect(await costOfYear()).toBe(9_600_000n);
  });

  it('follows the line when the line price is edited through PATCH /subscription-lines/{id}', async () => {
    await patchLinePrice(premiumLineId, '850000');

    expect(await costOfYear()).toBe(10_200_000n);
  });

  it('prices a seat of the plan of the first line at the price of that line in the baseline and follows its edit', async () => {
    const standardSeat = await h.staff(unit.department, 'LP1-STANDARD');
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id, granted_on)
       SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, e.id, e.employee_code || '@acme.vn',
              lower(e.employee_code) || '@acme.vn', $3::date, 'ACTUAL', gen_random_uuid(), $3::date
         FROM employees e, subscriptions s WHERE e.id = $1 AND s.id = $2`,
      [standardSeat.employeeId, subscriptionId, `${h.year}-01-05`],
    );
    const priceOf = async () =>
      (await baselineOf()).departments
        .find((row) => row.departmentId === unit.department.id)
        ?.software.find((row) => row.subscriptionId === subscriptionId)?.monthlyUnitPrice?.amount;

    expect(await priceOf()).toBe('500000');
    await patchLinePrice(standardLineId, '450000');
    expect(await priceOf()).toBe('450000');
  });

  it('charges the year of a period with two plans the line of each plan: one seat at 450.000 and one at 850.000, twelve months', async () => {
    const department = (await baselineOf()).departments.find((row) => row.departmentId === unit.department.id);
    const entry = department?.software.find((row) => row.subscriptionId === subscriptionId);

    expect(entry?.monthsRunning).toBe(12);
    expect(entry?.estimatedAnnualCost?.amount).toBe('15600000');
    expect(department?.estimatedAnnualCost.amount).toBe('15600000');
  });
});
