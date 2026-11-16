import request from 'supertest';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface Money {
  amount: string;
}
interface EffectiveWire {
  base: Money;
  reserve: Money;
  total: Money;
  adjustment?: Money;
}
interface YearRowWire {
  year: number;
  code: string | null;
  base: Money | null;
  budget: Money | null;
  effectiveBudget: Pick<EffectiveWire, 'base' | 'reserve' | 'total'> | null;
}
interface BudgetRowWire {
  costCenter: { id: string };
  base: Money | null;
  total: Money | null;
  effectiveBudget: EffectiveWire | null;
  remainingWithReserve: Money | null;
  overBudget: boolean;
}

/**
 * The effective budget is what the budget is read as everywhere (`AD-1.3`, T-AD1, R-33, R-48): the check of a request, the table, the totals and the head's own view. A
 * Cost Center that holds nothing but an adjustment has a budget; a request of 15 tr that did not fit passes once the adjustment is approved; the version stays as it was.
 */
describe('the budget a request is checked against and the budget the views show is the effective one (integration; AD-1.3, T-AD1)', () => {
  let plan: string;
  let counter = 0;
  const unit = async (): Promise<Unit> => h.departmentWithHead(`P-AE${(counter += 1)}`);
  /** Asked and approved while the cycle of the year is locked: an adjustment is made only then (FIX-AD1, AD1-01); the cycle is open again after, for the budgets the next case makes. */
  const adjust = async (to: Unit, tr: number, year = h.year): Promise<string> =>
    h.withLockedCycle(async () => {
      const asked = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/budget-adjustments')
          .set(h.as(h.finance))
          .send({
            year,
            kind: 'SUPPLEMENT',
            toCostCenterId: to.department.unitId,
            amount: h.money(tr * M),
            reason: 'Bổ sung trong năm',
          })
          .expect(201),
      );
      await request(h.server())
        .post(`/api/v1/budget-adjustments/${asked.id}/decision`)
        .set(h.as(h.deciderOf()))
        .send({ decision: 'APPROVE' })
        .expect(200);

      return asked.id;
    }, year);
  const checkedYear = async (u: Unit, amountTr: number, year = h.year): Promise<YearRowWire> => {
    const id = await h.paidRequest(u, plan, { amount: amountTr * M, year });
    const outcome = await h.route(id, u.head.account);
    if (outcome.status !== 'ROUTED') throw new Error(`not checkable: ${outcome.reason}`);

    return h.dataOf<{ items: YearRowWire[] }>(await h.checkYears(id).expect(200)).items[0];
  };
  const rowOf = async (u: Unit): Promise<BudgetRowWire> =>
    h
      .dataOf<{ items: BudgetRowWire[] }>(await h.table(h.finance, { year: h.year, pageSize: 100 }).expect(200))
      .items.find((row) => row.costCenter.id === u.department.unitId) as BudgetRowWire;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('T-AD1 R-48: a Cost Center with no version has no budget for a request of 15 tr; a supplement of 20 tr, approved, makes one, and then 15 tr passes', async () => {
    const u = await unit();
    expect(await checkedYear(u, 15)).toMatchObject({ code: 'NO_ACTIVE_BUDGET', effectiveBudget: null });

    await adjust(u, 20);

    expect(await checkedYear(u, 15)).toMatchObject({
      code: 'BUDGET_OK',
      base: { amount: String(20 * M) },
      budget: { amount: String(20 * M) },
      effectiveBudget: {
        base: { amount: String(20 * M) },
        reserve: { amount: '0' },
        total: { amount: String(20 * M) },
      },
    });
  });

  it('a request that did not fit the version fits the effective budget: base 100 tr and 90 tr spent refuse 15 tr, a supplement of 20 tr makes it 120 tr and 15 tr passes', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M, spent: 90 * M });
    expect(await checkedYear(u, 15)).toMatchObject({ code: 'INSUFFICIENT_BUDGET', base: { amount: String(100 * M) } });

    await adjust(u, 20);

    expect(await checkedYear(u, 15)).toMatchObject({
      code: 'BUDGET_OK',
      base: { amount: String(120 * M) },
      effectiveBudget: { base: { amount: String(120 * M) }, total: { amount: String(120 * M) } },
    });
  });

  it('QĐ-97c: each year reads its own effective budget: a supplement of 20 tr for this year leaves next year as it was (15 tr does not fit there), and the one for next year makes it fit', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M, spent: 90 * M });
    await h.budgetFor(u, { total: 100 * M, spent: 90 * M, year: h.next });
    await adjust(u, 20);

    expect(await checkedYear(u, 15)).toMatchObject({
      year: h.year,
      code: 'BUDGET_OK',
      base: { amount: String(120 * M) },
    });
    expect(await checkedYear(u, 15, h.next)).toMatchObject({
      year: h.next,
      code: 'INSUFFICIENT_BUDGET',
      base: { amount: String(100 * M) },
    });

    await adjust(u, 20, h.next);

    expect(await checkedYear(u, 15, h.next)).toMatchObject({
      year: h.next,
      code: 'BUDGET_OK',
      base: { amount: String(120 * M) },
    });
    expect(await checkedYear(u, 15)).toMatchObject({ year: h.year, base: { amount: String(120 * M) } });
  });

  it('the table, the totals and the view of the head read the effective budget and keep the version: base and total of the version, effective base 120 tr, 30 tr left after 90 tr spent', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M, reserve: 10 * M, spent: 90 * M });
    await adjust(u, 20);

    const row = await rowOf(u);
    expect(row).toMatchObject({
      base: { amount: String(100 * M) },
      total: { amount: String(110 * M) },
      effectiveBudget: {
        base: { amount: String(120 * M) },
        reserve: { amount: String(10 * M) },
        total: { amount: String(130 * M) },
        adjustment: { amount: String(20 * M) },
      },
      remainingWithReserve: { amount: String(40 * M) },
      overBudget: false,
    });
    const mine = h.dataOf<{ budget: BudgetRowWire }>(await h.mine(u.head.account, h.year).expect(200)).budget;
    expect(mine).toMatchObject({
      base: { amount: String(100 * M) },
      effectiveBudget: { base: { amount: String(120 * M) }, adjustment: { amount: String(20 * M) } },
      remainingWithReserve: { amount: String(40 * M) },
    });
    const summary = h.dataOf<{ totals: Record<string, { base: Money; effectiveBudget: EffectiveWire }> }>(
      await h.summary(h.finance, { year: h.year }).expect(200),
    ).totals.VND;
    expect(BigInt(summary.effectiveBudget.base.amount) - BigInt(summary.base.amount)).toBe(
      BigInt(summary.effectiveBudget.adjustment?.amount ?? 0),
    );
    expect(BigInt(summary.effectiveBudget.adjustment?.amount ?? 0)).toBeGreaterThanOrEqual(BigInt(20 * M));
  });

  it('a Cost Center that gave what it had left is shown with a negative adjustment and nothing left: base 100 tr, 90 tr spent, a transfer of 15 tr is 422 and one of 10 tr leaves 90 tr, all of it used', async () => {
    const u = await unit();
    const to = await unit();
    await h.budgetFor(u, { total: 100 * M, spent: 90 * M });
    await h.withLockedCycle(async () => {
      const transfer = (tr: number) =>
        request(h.server())
          .post('/api/v1/budget-adjustments')
          .set(h.as(h.finance))
          .send({
            year: h.year,
            kind: 'TRANSFER',
            fromCostCenterId: u.department.unitId,
            toCostCenterId: to.department.unitId,
            transferReason: 'COST_CENTER_CHANGE',
            amount: h.money(tr * M),
            reason: 'Phòng đổi Cost Center',
          });
      const over = await transfer(15).expect(422);
      expect((over.body as { error: { code: string } }).error.code).toBe('BUDGET_ADJUSTMENT.OVER_REMAINING');
      const asked = h.dataOf<{ id: string }>(await transfer(10).expect(201));
      await request(h.server())
        .post(`/api/v1/budget-adjustments/${asked.id}/decision`)
        .set(h.as(h.deciderOf()))
        .send({ decision: 'APPROVE' })
        .expect(200);
    });

    expect(await rowOf(u)).toMatchObject({
      effectiveBudget: { base: { amount: String(90 * M) }, adjustment: { amount: String(-10 * M) } },
      remainingWithReserve: { amount: '0' },
      overBudget: false,
    });
    expect(await rowOf(to)).toMatchObject({
      effectiveBudget: { base: { amount: String(10 * M) }, adjustment: { amount: '0' } },
    });
  });
});
