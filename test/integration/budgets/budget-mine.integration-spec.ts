import type { MineWire } from '../../../src/modules/budgets/budget/budget.dto';
import { BudgetCheckRepo } from '../../../src/modules/requests/spend/budget-check.repo';
import { PendingSpendContributions } from '../../../src/modules/budgets/public/budgets.extension-points';
import { BudgetViewsHarness } from '../../support/budget-views-harness';

const h = new BudgetViewsHarness();
const M = 1_000_000;

describe('BR-MF4-05 budgetMine over PostgreSQL', () => {
  let counter = 0;
  let plan: string;
  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);
  afterAll(async () => {
    await h.stop();
  });
  const unit = async () => h.departmentWithHead(`BV-M${++counter}`);
  const mine = async (u: Awaited<ReturnType<typeof unit>>, year = h.year) =>
    h.dataOf<{ budget: MineWire }>(await h.mine(u.head.account, year).expect(200)).budget;

  it('BR-MF1-06f / BR-MF4-05 shares pending reserve/unconfirmed and blocked rules, with the exact remaining boundary', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M, reserve: 20 * M, held: 30 * M, spent: 10 * M });
    const waiting = await h.paidRequest(u, plan, { amount: 20 * M });
    const reserve = await h.paidRequest(u, plan, { amount: 55 * M });
    const blocked = await h.paidRequest(u, plan, { amount: 500 * M });
    await h.sendOn([waiting, reserve, blocked], u.head.account).expect(201);
    const view = await mine(u);
    expect(view).toMatchObject({
      status: 'ACTIVE',
      base: { amount: String(100 * M) },
      reserve: { amount: String(20 * M) },
      committed: { amount: String(30 * M) },
      spent: { amount: String(10 * M) },
      pendingSpend: { amount: String(75 * M) },
      remainingBase: { amount: String(-15 * M) },
      remainingWithReserve: { amount: String(5 * M) },
      overBudget: false,
    });
    const pairs = [{ costCenterId: u.department.unitId, year: h.year }];
    const checks = h.ctx.app.get(BudgetCheckRepo, { strict: false });
    const pending = h.ctx.app.get(PendingSpendContributions, { strict: false });
    expect(await pending.totals(pairs)).toEqual(await checks.pendingMany(pairs));
    expect(await checks.pendingFor(u.department.unitId, h.year, null)).toBe(BigInt(75 * M));
    const tooMuch = await h.paidRequest(u, plan, { amount: 5 * M + 1 });
    const exact = await h.paidRequest(u, plan, { amount: 5 * M });
    expect(await h.route(tooMuch, u.head.account)).toMatchObject({ status: 'ROUTED', outcome: 'BLOCKED' });
    expect(await h.route(exact, u.head.account)).toMatchObject({ status: 'ROUTED', outcome: 'USES_RESERVE' });
  });

  it('BR-MF4-01 exposes only the published department ceiling and cycle deadlines', async () => {
    const u = await unit();
    await h.ctx.sql.query(
      `INSERT INTO budget_department_ceilings
      (cycle_id, department_id, signed_commitments_minor, planned_seats_minor, priority_minor, total_minor, published_total_minor)
      SELECT id, $1, 10, 20, 30, 60, 60 FROM budget_cycles WHERE year = $2`,
      [u.department.id, h.year],
    );
    expect(await mine(u)).toMatchObject({
      departmentCeiling: {
        total: { amount: '60' },
        signedCommitments: { amount: '10' },
        plannedSeats: { amount: '20' },
        priority: { amount: '30' },
      },
      cycle: { submissionDeadline: `${h.year}-12-01`, decisionDeadline: `${h.year}-12-15`, published: true },
    });
    await h.ctx.sql.query(
      'UPDATE budget_cycles SET published_at = NULL, published_by_employee_id = NULL WHERE year = $1',
      [h.year],
    );
    const unpublished = await mine(u);
    expect(unpublished.departmentCeiling).toBeNull();
    expect(unpublished.cycle?.published).toBe(false);
    expect(unpublished).not.toHaveProperty('annualCeiling');
    expect(unpublished).not.toHaveProperty('sharedPoolReserve');
    expect((await mine(u, h.year + 5)).cycle).toBeNull();
  });

  it('BR-MF4-05 reads unattached commitments without inventing approved amounts', async () => {
    const u = await unit();
    await h.unattached(u, h.next, 30 * M);
    expect(await mine(u, h.next)).toMatchObject({
      status: 'NO_ACTIVE_BUDGET',
      base: null,
      reserve: null,
      total: null,
      committed: { amount: String(30 * M) },
      remainingBase: null,
      remainingWithReserve: null,
    });
  });

  it('BR-MF4-05 preserves negative remaining amounts when actual spend exceeds budget', async () => {
    // Restore the fixture cycle after the publication-visibility test.
    await h.ctx.sql.query(
      'UPDATE budget_cycles SET published_at = now(), published_by_employee_id = $2 WHERE year = $1',
      [h.year, h.finance.employeeId],
    );
    const u = await unit();
    await h.budgetFor(u, { total: 10 * M, spent: 11 * M });
    expect(await mine(u)).toMatchObject({ remainingWithReserve: { amount: String(-M) }, overBudget: true });
  });
});
