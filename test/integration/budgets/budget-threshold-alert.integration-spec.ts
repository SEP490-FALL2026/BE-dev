import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../../../src/modules/budgets/budget/budget-facts.repo';
import { ThresholdRepo } from '../../../src/modules/budgets/threshold/threshold.repo';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

/**
 * The alert of 80 and 100 percent of the base (`RV-2`, `T-RV2`, `QĐ-111af`, R-28, MAJ-10), through the real writes: an invoice booked to the Cost Center, the commitment a decision of the spending approver
 * holds, and an adjustment of the budget. The base is 120 tr: 96 tr used tells 80 percent, 100 tr tells nothing new, 120 tr tells 100 percent; an adjustment of 8 tr raises the base to 128 tr and tells
 * nothing by itself, 128 tr used tells 100 percent once more and does not tell 80 percent again. The head of the department and Finance hear each alert once.
 */
describe('the use of a budget tells 80 and 100 percent of its base once each time it goes over (integration; RV-2, T-RV2)', () => {
  let plan: string;
  let vendorId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    vendorId = (await h.vendorOf(plan)).id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const department = async (total: number | null): Promise<Unit> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-RV2-${counter}`);
    // The ceiling of the year is out of the way of every budget but the one the adjustment needs room under.
    await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = 1000000000000 WHERE year = $1`, [h.year]);
    if (total !== null) await h.budgetFor(unit, { total: total * M });

    return unit;
  };
  /** An invoice of `tr` million booked as an expense of the Cost Center, as the signature of Finance books it. */
  const spend = async (unit: Unit, tr: number): Promise<void> => {
    await h.recordPurchase(vendorId, {
      chargedCostCenterId: unit.department.unitId,
      netMinor: BigInt(tr * M),
      issuedOn: `${h.year}-11-03`,
      serviceMonth: `${h.year}-11-01`,
    });
  };
  const alerts = async (unit: Unit): Promise<Array<[number, bigint]>> =>
    (
      await h.ctx.sql.query<{ threshold: number; base_minor: string }>(
        `SELECT threshold, base_minor::text AS base_minor FROM budget_threshold_alerts
          WHERE cost_center_id = $1 AND year = $2 ORDER BY base_minor, threshold`,
        [unit.department.unitId, h.year],
      )
    ).rows.map((row): [number, bigint] => [row.threshold, BigInt(row.base_minor)]);
  /** Who was told the threshold of this Cost Center, over every base. */
  const told = async (unit: Unit, threshold: number): Promise<string[]> =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string }>(
        `SELECT recipient_employee_id FROM in_app_notifications
          WHERE code = 'BUDGET_THRESHOLD_REACHED' AND params->>'costCenterId' = $1 AND params->>'threshold' = $2
          ORDER BY recipient_employee_id`,
        [unit.department.unitId, String(threshold)],
      )
    ).rows.map((row) => row.recipient_employee_id);
  const headAndFinance = (unit: Unit): string[] => [unit.head.employeeId, h.finance.employeeId].sort();
  /** The annual ceiling leaves 29 tr, so that a supplement of 8 tr fits. */
  const ceilingLeaving = async (leftTr: number): Promise<void> => {
    const allocated = await h.ctx.app
      .get(BudgetFactsRepo, { strict: false })
      .allocatedOfYear(h.seed.organizationId, h.year);
    await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = $2 WHERE year = $1`, [
      h.year,
      (allocated + BigInt(leftTr * M)).toString(),
    ]);
  };

  it('T-RV2: base 120 tr: 96 tr used tells 80 percent, 100 tr tells nothing new, 120 tr tells 100 percent; +8 tr of adjustment tells nothing, 128 tr used tells 100 percent again and not 80 percent', async () => {
    const unit = await department(120);

    await spend(unit, 90);
    expect(await alerts(unit)).toEqual([]);

    await spend(unit, 6);
    expect(await alerts(unit)).toEqual([[80, BigInt(120 * M)]]);
    expect(await told(unit, 80)).toEqual(headAndFinance(unit));

    await spend(unit, 4);
    expect(await alerts(unit)).toEqual([[80, BigInt(120 * M)]]);

    await spend(unit, 20);
    expect(await alerts(unit)).toEqual([
      [80, BigInt(120 * M)],
      [100, BigInt(120 * M)],
    ]);
    expect(await told(unit, 100)).toEqual(headAndFinance(unit));

    await spend(unit, 1);
    expect(await alerts(unit)).toHaveLength(2);

    // The adjustment raises the base to 128 tr and moves no use, so it tells nothing (R-28).
    await ceilingLeaving(29);
    const asked = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/budget-adjustments')
        .set(h.as(h.finance))
        .send({
          year: h.year,
          kind: 'SUPPLEMENT',
          toCostCenterId: unit.department.unitId,
          amount: h.money(8 * M),
          reason: 'Điều chỉnh trong năm',
        })
        .expect(201),
    );
    await request(h.server())
      .post(`/api/v1/budget-adjustments/${asked.id}/decision`)
      .set(h.as(h.deciderOf()))
      .send({ decision: 'APPROVE' })
      .expect(200);
    const facts = (
      await h.ctx.app.get(BudgetFactsRepo, { strict: false }).yearFacts(unit.department.unitId, [h.year])
    ).get(h.year);
    expect(facts?.baseMinor).toBe(BigInt(128 * M));
    expect(await alerts(unit)).toHaveLength(2);

    // The use goes from 121 tr to 128 tr: the base of 128 tr is reached, 80 percent of it (102,4 tr) was passed long ago.
    await spend(unit, 7);
    expect(await alerts(unit)).toEqual([
      [80, BigInt(120 * M)],
      [100, BigInt(120 * M)],
      [100, BigInt(128 * M)],
    ]);
    expect(await told(unit, 80)).toEqual(headAndFinance(unit));
    expect(await told(unit, 100)).toEqual([...headAndFinance(unit), ...headAndFinance(unit)].sort());
  }, 120000);

  it('the commitment the spending approver holds counts as use: 85 tr held against 100 tr tells 80 percent to the head and to Finance', async () => {
    const unit = await department(100);
    const requestId = await h.waitingForApprover(unit, plan, { amount: 85 * M });

    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);

    expect(await alerts(unit)).toEqual([[80, BigInt(100 * M)]]);
    expect(await told(unit, 80)).toEqual(headAndFinance(unit));
  }, 120000);

  it('a Cost Center with no budget has no base, so it tells nothing however much it uses', async () => {
    const unit = await department(null);

    await spend(unit, 50);

    expect(await alerts(unit)).toEqual([]);
    expect(await told(unit, 80)).toEqual([]);
  }, 120000);

  it('MAJ-10: the same Cost Center, year, threshold and base is written once: a second change that crosses it writes nothing and tells nobody', async () => {
    const unit = await department(120);
    const repo = h.ctx.app.get(ThresholdRepo, { strict: false });
    const alert = {
      costCenterId: unit.department.unitId,
      year: h.year,
      threshold: 80 as const,
      baseMinor: BigInt(120 * M),
    };
    const insert = () =>
      h.ctx.app.get(TransactionRunner, { strict: false }).run((tx) => repo.insertNew(tx, [alert], new Date()));

    expect(await insert()).toEqual([alert]);
    expect(await insert()).toEqual([]);
    expect(await alerts(unit)).toEqual([[80, BigInt(120 * M)]]);
  }, 120000);
});
