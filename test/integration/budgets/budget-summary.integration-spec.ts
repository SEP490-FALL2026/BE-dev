import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface Money {
  amount: string;
  currency: string;
}
interface TableRow {
  costCenter: { id: string };
  base: Money;
  reserve: Money;
  total: Money;
}
interface Summary {
  year: number;
  totals: Record<
    string,
    {
      currency: string;
      base: Money;
      reserve: Money;
      total: Money;
      committed: Money;
      spent: Money;
      remaining: Money;
      costCenterCount: number;
      overBudgetCount: number;
    }
  >;
  lastInvoiceRecordedAt: string | null;
}

describe('the company-wide budget figures over PostgreSQL (US-12-01)', () => {
  let counter = 0;
  let first: Unit;
  let second: Unit;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    counter += 1;
    first = await h.departmentWithHead(`P-S${counter}`);
    counter += 1;
    second = await h.departmentWithHead(`P-S${counter}`);
    // 100 million with 20 held; 50 million with 60 held, which is more than the budget allows.
    await h.budgetFor(first, { total: 100 * M, held: 20 * M });
    await h.budgetFor(second, { total: 50 * M, held: 60 * M });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('adds the current budgets of the year for the currency and counts the Cost Center that is over budget', async () => {
    const summary = h.dataOf<Summary>(await h.summary(h.finance, { year: h.year }).expect(200));

    expect(summary.year).toBe(h.year);
    expect(Object.keys(summary.totals)).toEqual([h.reporting]);
    expect(summary.totals[h.reporting]).toEqual({
      currency: h.reporting,
      base: { amount: String(150 * M), currency: h.reporting },
      reserve: { amount: '0', currency: h.reporting },
      total: { amount: String(150 * M), currency: h.reporting },
      committed: { amount: String(80 * M), currency: h.reporting },
      spent: { amount: '0', currency: h.reporting },
      remaining: { amount: String(70 * M), currency: h.reporting },
      pendingSpend: { amount: '0', currency: h.reporting },
      remainingBase: { amount: String(70 * M), currency: h.reporting },
      remainingWithReserve: { amount: String(70 * M), currency: h.reporting },
      costCenterCount: 2,
      overBudgetCount: 1,
    });
    expect(summary.lastInvoiceRecordedAt).toBeNull();
  });

  it('has no totals for a year that has no current budget', async () => {
    const summary = h.dataOf<Summary>(await h.summary(h.finance, { year: h.year + 5 }).expect(200));

    expect(summary.totals).toEqual({});
  });

  it('BR-MF4-05 admits the spending approver and refuses department heads', async () => {
    await h.summary(h.boss.account, { year: h.year }).expect(200);
    await h.summary(first.head.account, { year: h.year }).expect(403);
  });

  it('gives the base and the reserve on each row of the table, so that they add up to the total', async () => {
    const rows = h.dataOf<{ items: TableRow[] }>(
      await h.table(h.finance, { year: h.year, pageSize: 100 }).expect(200),
    ).items;
    const row = rows.find((item) => item.costCenter.id === first.department.unitId);

    expect(row?.base).toEqual({ amount: String(100 * M), currency: h.reporting });
    expect(row?.reserve).toEqual({ amount: '0', currency: h.reporting });
    expect(row?.total).toEqual({ amount: String(100 * M), currency: h.reporting });
  });
});
