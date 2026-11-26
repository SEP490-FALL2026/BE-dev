import { pretendBusinessToday } from '../../support/pretend-today';
import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

interface Money {
  amount: string;
  currency: string;
}
interface NextYearBudget {
  year: number;
  approved: Money | null;
  remaining: Money | null;
  remainingAfter: Money | null;
  warning: boolean;
}
const vnd = (amount: number): Money => ({ amount: String(amount), currency: 'VND' });

/**
 * What the spending approver reads of the budget of the year after on a request that goes into it (`QĐ-111al`, R-15, R-46, S-3): the approved
 * budget (base and reserve), what the other approved requests kept of that year, and what is left once this one is approved, with a warning
 * that never stops the approval. Nobody else reads a figure of that budget: the sender sees only "from 01/01: X" of their own request.
 * The numbers are fixed: three requests of 600.000 a month for 9 months from 15/11 each keep 7 months of the year after, 4.200.000.
 */
describe('the budget of the year after on the spend step of a request (QĐ-111al, R-15, R-46, S-3) over PostgreSQL', () => {
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  afterEach(() => jest.restoreAllMocks());

  /** A department whose people are in it since 01/01 (the fixed day comes before the real one), with the budget of this year and, when given, of the next. */
  const unit = async (next?: { total: number; reserve: number }): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-NYB${counter}`);
    await h.budgetFor(made, { total: 100_000 * M });
    if (next) await h.budgetFor(made, { ...next, year: h.next });
    const first = `${h.year}-01-01`;
    await h.ctx.sql.query(
      `UPDATE employees SET hire_date = $2 WHERE id IN (SELECT employee_id FROM employee_placements WHERE department_id = $1)`,
      [made.department.id, first],
    );
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = $2 WHERE department_id = $1`, [
      made.department.id,
      first,
    ]);
    await h.ctx.sql.query(`UPDATE department_head_periods SET valid_from = $2 WHERE department_id = $1`, [
      made.department.id,
      first,
    ]);

    return made;
  };
  /** A plan of a new application at that price a month. */
  const planAt = async (monthly: number): Promise<string> => {
    const subscription = await h.subscription(100, 'K1');
    await h.ctx.sql.query(
      `UPDATE subscriptions SET unit_price_minor = $2, monthly_unit_price_minor = $2, price_reporting_minor = $2 WHERE id = $1`,
      [subscription, monthly],
    );
    await h.ctx.sql.query(`UPDATE subscription_lines SET monthly_unit_price_minor = $2 WHERE subscription_id = $1`, [
      subscription,
      monthly,
    ]);

    return h.planOf(subscription);
  };
  /** A request of the member for months of use, confirmed by the head and sent on: it waits for the approver. */
  const waiting = async (u: Unit, termMonths: number): Promise<string> => {
    pretendBusinessToday(h.ctx.app, `${h.year}-11-15`);
    const sent = await h.sent(u.member, await planAt(600_000), { termMonths });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.sendOn([sent.id], u.head.account).expect(201);

    return sent.id;
  };
  const nextYearBudgetOf = async (id: string): Promise<NextYearBudget | null> =>
    h.dataOf<{ spendApproval: { nextYearBudget: NextYearBudget | null } }>(
      await h.approvalOf(id, h.boss.account).expect(200),
    ).spendApproval.nextYearBudget;

  it('QĐ-111al: the approver reads the approved budget (base 8.000.000 and reserve 2.000.000), what the others kept, and what is left once this one is approved', async () => {
    const u = await unit({ total: 8 * M, reserve: 2 * M });
    const first = await waiting(u, 9);
    const second = await waiting(u, 9);

    // Nothing is approved yet in the Cost Center: the whole budget is left, and this request takes 4.200.000 of it.
    expect(await nextYearBudgetOf(first)).toEqual({
      year: h.next,
      approved: vnd(10 * M),
      remaining: vnd(10 * M),
      remainingAfter: vnd(5_800_000),
      warning: false,
    });
    await h.decideSpend(first, { decision: 'APPROVE' }, h.boss.account).expect(200);

    // The first kept 4.200.000: 5.800.000 is left for the second, and 1.600.000 once the second is approved. The first reads the same
    // once approved (it is compared with the others, not with itself).
    expect(await nextYearBudgetOf(second)).toEqual({
      year: h.next,
      approved: vnd(10 * M),
      remaining: vnd(5_800_000),
      remainingAfter: vnd(1_600_000),
      warning: false,
    });
    expect(await nextYearBudgetOf(first)).toMatchObject({ remaining: vnd(10 * M), remainingAfter: vnd(5_800_000) });
  });

  it('QĐ-111al: a request that takes more than what is left only warns, and the approver can still approve it', async () => {
    const u = await unit({ total: 8 * M, reserve: 2 * M });
    const [first, second, third] = [await waiting(u, 9), await waiting(u, 9), await waiting(u, 9)];
    await h.decideSpend(first, { decision: 'APPROVE' }, h.boss.account).expect(200);
    await h.decideSpend(second, { decision: 'APPROVE' }, h.boss.account).expect(200);

    // 10.000.000 − 2 × 4.200.000 = 1.600.000 is left; the third takes 4.200.000.
    expect(await nextYearBudgetOf(third)).toEqual({
      year: h.next,
      approved: vnd(10 * M),
      remaining: vnd(1_600_000),
      remainingAfter: vnd(-2_600_000),
      warning: true,
    });

    await h.decideSpend(third, { decision: 'APPROVE' }, h.boss.account).expect(200);
    expect(await nextYearBudgetOf(third)).toMatchObject({ remaining: vnd(1_600_000), warning: true });
  });

  it('R-15: only what the approvals of this year kept of the year after is taken from it: a request approved the year before kept its part for this year, not the next', async () => {
    const u = await unit({ total: 8 * M, reserve: 2 * M });
    const lastYear = await waiting(u, 9);
    await h.decideSpend(lastYear, { decision: 'APPROVE' }, h.boss.account).expect(200);
    await h.ctx.sql.query(`UPDATE access_requests SET budget_year = $2 WHERE id = $1`, [lastYear, h.year - 1]);
    const thisYear = await waiting(u, 9);
    await h.decideSpend(thisYear, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const probe = await waiting(u, 9);

    // Only the request approved this year counts: 10.000.000 − 4.200.000. Counting the one of last year too would leave 1.600.000.
    expect(await nextYearBudgetOf(probe)).toMatchObject({ remaining: vnd(5_800_000), remainingAfter: vnd(1_600_000) });
  });

  it('B1A-01: a request approved in dollars by an older release is not added to the sums of the Cost Center, and its own number is not read as dong', async () => {
    const u = await unit({ total: 8 * M, reserve: 2 * M });
    const first = await waiting(u, 9);
    await h.decideSpend(first, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const legacy = await waiting(u, 9);
    await h.decideSpend(legacy, { decision: 'APPROVE' }, h.boss.account).expect(200);
    // An older release approved it in dollars: the part of the year after it kept is 7 months at 20.00, that is 14.000 cents.
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_currency = 'USD', next_year_amount_minor = 14000 WHERE id = $1`,
      [legacy],
    );
    const probe = await waiting(u, 9);

    // Only the request in dong is taken from the budget: 10.000.000 − 4.200.000. Taking 14.000 as dong would leave 5.786.000.
    expect(await nextYearBudgetOf(probe)).toMatchObject({ remaining: vnd(5_800_000), remainingAfter: vnd(1_600_000) });
    // The request in dollars has no figure of the budget of its own: it keeps nothing in dong.
    expect(await nextYearBudgetOf(legacy)).toBeNull();
  });

  it('R-46: a right with no end keeps twelve months of the year after, so it counts for the warning of the others', async () => {
    const u = await unit({ total: 8 * M, reserve: 2 * M });
    pretendBusinessToday(h.ctx.app, `${h.year}-11-20`);
    const lasting = await h.sent(u.member, await planAtKind('K2', 375_000), { termMonths: null });
    await h.decide(lasting.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.sendOn([lasting.id], u.head.account).expect(201);
    await h.decideSpend(lasting.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const next = await waiting(u, 9);

    // 12 × 375.000 = 4.500.000 kept by the right with no end: 5.500.000 is left.
    expect(await nextYearBudgetOf(next)).toMatchObject({ remaining: vnd(5_500_000), remainingAfter: vnd(1_300_000) });
  });

  it('QĐ-111al: a Cost Center with no approved budget of the year after has no figures and no warning; a request that keeps nothing of that year has none at all', async () => {
    const u = await unit();
    const long = await waiting(u, 9);
    const short = await waiting(u, 1);

    expect(await nextYearBudgetOf(long)).toEqual({
      year: h.next,
      approved: null,
      remaining: null,
      remainingAfter: null,
      warning: false,
    });
    expect(await nextYearBudgetOf(short)).toBeNull();
  });

  it('the queue of the approver carries the same figures for each request, and null for the one that keeps nothing of the year after', async () => {
    const u = await unit({ total: 8 * M, reserve: 2 * M });
    const long = await waiting(u, 9);
    const short = await waiting(u, 1);

    const page = h.dataOf<{ items: Array<{ requestId: string; nextYearBudget: NextYearBudget | null }> }>(
      await h.approvals(h.boss.account, { pageSize: 100 }).expect(200),
    );

    expect(page.items.find((item) => item.requestId === long)?.nextYearBudget).toEqual({
      year: h.next,
      approved: vnd(10 * M),
      remaining: vnd(10 * M),
      remainingAfter: vnd(5_800_000),
      warning: false,
    });
    expect(page.items.find((item) => item.requestId === short)?.nextYearBudget).toBeNull();
  });

  it('S-3: Finance, the other reader of the check of a request, reads the same figures there, before and after the decision; the head and the sender are answered as if there were none', async () => {
    const u = await unit({ total: 8 * M, reserve: 2 * M });
    const id = await waiting(u, 9);
    const asFinance = async () =>
      h.dataOf<{ budgetCheck: { nextYearBudget?: NextYearBudget | null } }>(await h.checkOf(id, h.finance).expect(200))
        .budgetCheck.nextYearBudget;
    const figures = {
      year: h.next,
      approved: vnd(10 * M),
      remaining: vnd(10 * M),
      remainingAfter: vnd(5_800_000),
      warning: false,
    };

    expect(await asFinance()).toEqual(figures);
    expect(await asFinance()).toEqual(await nextYearBudgetOf(id));
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    // The request is compared with the others, not with itself, so what Finance reads does not move with the decision.
    expect(await asFinance()).toEqual(figures);
    for (const account of [u.head.account, u.member.account]) {
      const refused = await h.checkOf(id, account).expect(404);
      expect(JSON.stringify(refused.body)).not.toContain('nextYearBudget');
    }
  });

  it('S-3: the sender and the head never read a figure of the budget of the year after: the preview and the request carry only the part of the request, as an estimate', async () => {
    const u = await unit({ total: 8 * M, reserve: 2 * M });
    pretendBusinessToday(h.ctx.app, `${h.year}-11-15`);
    const plan = await planAt(600_000);
    const preview = await h.previewRequest({ planId: plan, termMonths: 9 }, u.member.account).expect(200);
    const sent = await h.sent(u.member, plan, { termMonths: 9 });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    const asSender = await h.fetch(sent.id, u.member.account).expect(200);
    const asHead = await h.fetch(sent.id, u.head.account).expect(200);

    for (const body of [preview.body, asSender.body, asHead.body]) {
      expect(JSON.stringify(body)).not.toContain('nextYearBudget');
    }
    // What they read of the year after is the part of their own request: "from 01/01: 4.200.000 (an estimate)".
    expect(
      h.dataOf<{ preview: { cost: { nextYear: { amount: Money; estimate: boolean } } } }>(preview).preview.cost
        .nextYear,
    ).toMatchObject({ amount: vnd(4_200_000), estimate: true });
  });

  /** A plan of that kind at that price a month. */
  async function planAtKind(kind: 'K1' | 'K2', monthly: number): Promise<string> {
    const subscription = await h.subscription(100, kind);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET unit_price_minor = $2, monthly_unit_price_minor = $2, price_reporting_minor = $2 WHERE id = $1`,
      [subscription, monthly],
    );
    await h.ctx.sql.query(`UPDATE subscription_lines SET monthly_unit_price_minor = $2 WHERE subscription_id = $1`, [
      subscription,
      monthly,
    ]);

    return h.planOf(subscription);
  }
});
