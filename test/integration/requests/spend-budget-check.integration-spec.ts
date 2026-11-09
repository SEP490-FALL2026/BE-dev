import type { RoutingOutcome } from '../../../src/modules/requests/spend/spend-routing.service';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface YearRowWire {
  year: number;
  cost: { amount: string };
  code: string | null;
  budget: { amount: string } | null;
  base: { amount: string } | null;
  reserve: { amount: string } | null;
  held: { amount: string } | null;
  spent: { amount: string } | null;
  remaining: { amount: string } | null;
  remainingBase: { amount: string } | null;
  remainingWithReserve: { amount: string } | null;
  pending: { amount: string } | null;
  shareBasisPoints: number | null;
}
interface CheckWire {
  route: string;
  outcome: string;
  blockedReasons: string[];
  primaryCode: string | null;
  overBaseBy: { amount: string } | null;
  overBy: { amount: string } | null;
  bindingTotal: { amount: string };
  yearCount: number;
}

describe('the check of the budget of a request over PostgreSQL (US-06-12, BR-MF1-06e..g)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10)); // 1 000 000 VND a seat a month; the specs write the payments they need
    // Only tax that is deducted, so that the cost of a payment is the payment.
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-K${counter}`);
  };
  /** Base 100, reserve 10, 20 held, 40 spent: 40 left of the base and 50 with the reserve (millions). */
  const example = (u: Unit, extra: Record<string, number> = {}) =>
    h.budgetFor(u, { total: 100 * M, reserve: 10 * M, held: 20 * M, spent: 40 * M, ...extra });
  const checked = async (requestId: string, u: Unit): Promise<Extract<RoutingOutcome, { status: 'ROUTED' }>> => {
    const outcome = await h.route(requestId, u.head.account);
    if (outcome.status !== 'ROUTED') throw new Error(`not checkable: ${outcome.reason}`);

    return outcome;
  };
  const checkWire = async (requestId: string) =>
    h.dataOf<{ budgetCheck: CheckWire }>(await h.checkOf(requestId).expect(200)).budgetCheck;
  const years = async (requestId: string) =>
    h.dataOf<{ items: YearRowWire[] }>(await h.checkYears(requestId).expect(200)).items;
  const approvals = async (requestId: string) =>
    Number(
      (
        await h.ctx.sql.query<{ count: string }>(`SELECT count(*) FROM approval_records WHERE request_id = $1`, [
          requestId,
        ])
      ).rows[0].count,
    );

  describe('BR-MF1-06g: the three outcomes and where each sends the request', () => {
    it('BR-MF1-06g: within the base, the spending approver is given the step at once, and the year shows the two levels (BR-MF1-06e)', async () => {
      const u = await unit();
      await example(u);
      const id = await h.paidRequest(u, plan, { amount: 15 * M });

      const outcome = await checked(id, u);

      expect(outcome.outcome).toBe('WITHIN_BASE');
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
      expect(await checkWire(id)).toMatchObject({
        route: 'SPEND_APPROVAL',
        outcome: 'WITHIN_BASE',
        blockedReasons: [],
        primaryCode: 'BUDGET_OK',
        yearCount: 1,
      });
      expect(await years(id)).toEqual([
        expect.objectContaining({
          year: h.year,
          code: 'BUDGET_OK',
          base: { amount: String(100 * M), currency: 'VND' },
          reserve: { amount: String(10 * M), currency: 'VND' },
          held: { amount: String(20 * M), currency: 'VND' },
          spent: { amount: String(40 * M), currency: 'VND' },
          pending: { amount: '0', currency: 'VND' },
          remainingBase: { amount: String(40 * M), currency: 'VND' },
          remainingWithReserve: { amount: String(50 * M), currency: 'VND' },
        }),
      ]);
    });

    it('BR-MF1-06g: one more than what is left of the base uses the reserve and waits in the queue of the head, with no step', async () => {
      const u = await unit();
      await example(u);
      const id = await h.paidRequest(u, plan, { amount: 40 * M + 1 });

      const outcome = await checked(id, u);

      expect(outcome.outcome).toBe('USES_RESERVE');
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await checkWire(id)).toMatchObject({
        route: 'SPEND_APPROVAL',
        outcome: 'USES_RESERVE',
        overBaseBy: { amount: '1' },
      });
    });

    it('BR-MF1-06g: exactly what is left with the reserve still uses the reserve; one more is blocked, over the reserve by 1', async () => {
      // Two Cost Centers: what waits to be decided in one is deducted from the other (BR-MF1-06f).
      const u = await unit();
      const v = await unit();
      await example(u);
      await example(v);
      const edge = await h.paidRequest(u, plan, { amount: 50 * M });
      const over = await h.paidRequest(v, plan, { amount: 50 * M + 1 });

      expect((await checked(edge, u)).outcome).toBe('USES_RESERVE');
      expect((await checked(over, v)).outcome).toBe('BLOCKED');

      expect(await checkWire(over)).toMatchObject({
        route: 'BLOCKED',
        outcome: 'BLOCKED',
        blockedReasons: ['OVER_RESERVE'],
        primaryCode: 'INSUFFICIENT_BUDGET',
        overBy: { amount: '1' },
      });
      expect(await h.state(over)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(over, 'SPEND_APPROVAL')).toEqual([]);
    });

    it('BR-MF1-06g(3)(ii): a year with no approved version is blocked with NO_APPROVED_BUDGET and shows no figure (not a budget of 0)', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 10 * M });

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({
        route: 'BLOCKED',
        blockedReasons: ['NO_APPROVED_BUDGET'],
        primaryCode: 'NO_ACTIVE_BUDGET',
      });
      expect(await years(id)).toEqual([
        expect.objectContaining({
          code: 'NO_ACTIVE_BUDGET',
          budget: null,
          base: null,
          held: null,
          spent: null,
          remainingBase: null,
        }),
      ]);
    });

    it('BR-MF1-06f: what waits to be decided is deducted from what is left, and the request is not counted against itself', async () => {
      const u = await unit();
      await example(u); // 40 left of the base
      const first = await h.paidRequest(u, plan, { amount: 30 * M });
      const second = await h.paidRequest(u, plan, { amount: 15 * M });

      expect((await checked(first, u)).outcome).toBe('WITHIN_BASE');
      // 30 now waits: 10 is left of the base (20 with the reserve) for the second, which is 15 and therefore uses the reserve.
      expect((await checked(second, u)).outcome).toBe('USES_RESERVE');
      expect((await years(second))[0]).toMatchObject({
        pending: { amount: String(30 * M) },
        remainingBase: { amount: String(10 * M) },
      });
      // Checked again it does not wait on itself, though it waits (unconfirmed) with its own newest check.
      expect((await checked(second, u)).outcome).toBe('USES_RESERVE');
      expect((await years(second))[0]).toMatchObject({ pending: { amount: String(30 * M) } });
    });

    it('never approves or refuses: the only decision of the request is the need step (AC-14)', async () => {
      const u = await unit();
      await example(u);
      const ok = await h.paidRequest(u, plan, { amount: 15 * M });
      const over = await h.paidRequest(u, plan, { amount: 80 * M });

      await checked(ok, u);
      await checked(over, u);

      expect(await approvals(ok)).toBe(1);
      expect(await approvals(over)).toBe(1);
    });

    it('QĐ-97c: there is no review of Finance, no high-value route and no line of the plan to be overdue', async () => {
      const u = await unit();
      await example(u);
      const id = await h.paidRequest(u, plan, { amount: 39 * M });

      await checked(id, u);

      const wire = await checkWire(id);
      expect(wire).toMatchObject({ route: 'SPEND_APPROVAL', primaryCode: 'BUDGET_OK' });
      expect(wire).not.toHaveProperty('planLineOverdue');
      expect(wire).not.toHaveProperty('noIndependentReview');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([]);
    });
  });

  describe('BR-MF1-07f, A5-2: what is left may be negative, and a cost of nothing is over nothing', () => {
    it('BR-MF1-07f: a request of 1 is blocked when what is left with the reserve is already negative', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, reserve: 10 * M, held: 120 * M });
      const id = await h.paidRequest(u, plan, { amount: 1 });

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({ outcome: 'BLOCKED', blockedReasons: ['OVER_RESERVE'] });
      expect((await years(id))[0].remainingWithReserve?.amount).toBe(String(-10 * M));
    });

    it('A5-2: a request that costs nothing this year is within the base whatever is left, takes nothing, and still reaches the approver', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, reserve: 10 * M, held: 120 * M });
      const id = await h.paidRequest(u, plan, { amount: 0 });

      const outcome = await checked(id, u);

      expect(outcome.outcome).toBe('WITHIN_BASE');
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await checkWire(id)).toMatchObject({ outcome: 'WITHIN_BASE', blockedReasons: [], overBaseBy: null });
    });

    it('A5-2: a request that costs nothing is still blocked when the year has no approved version', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 0 });

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({ outcome: 'BLOCKED', blockedReasons: ['NO_APPROVED_BUDGET'] });
    });
  });

  describe('BR-MF1-06g(3)(iv): a quote that is no longer valid (the price of a plan has no end date in the model, S1-08)', () => {
    const stale = async (u: Unit) => {
      const itPerson = { employeeId: h.it1.employeeId, account: h.it1 };
      await h.setItAdminInCharge(u.department, itPerson);
      const proposed = await h.proposed(u.member);
      await h.decide(proposed.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.saveAssessment(proposed.id, h.assessmentBody(), h.it1).expect(200);
      await h.completeAssessment(proposed.id, h.it1).expect(200);
      await h.setPayments(proposed.id, { amount: 10 * M });
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date - 1 WHERE request_id = $1`,
        [proposed.id],
      );

      return proposed.id;
    };

    it('BR-MF1-06g(3)(iv): makes no step and the request stays in the queue of its head with PRICE_EXPIRED', async () => {
      const u = await unit();
      await example(u);
      const id = await stale(u);

      const outcome = await checked(id, u);

      expect(outcome.outcome).toBe('BLOCKED');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await checkWire(id)).toMatchObject({
        blockedReasons: ['PRICE_EXPIRED'],
        primaryCode: 'STALE_COST_EVIDENCE',
      });
      // The head reads why, and how far over, and nothing of what is left (INF-06).
      const wire = h.dataOf<{ request: { spend: object } }>(await h.fetch(id, u.head.account).expect(200)).request;
      expect(wire.spend).toEqual({
        stage: 'BLOCKED',
        blockedReasons: ['PRICE_EXPIRED'],
        overBy: null,
        refusalReason: null,
      });
      await h.checkOf(id, u.head.account).expect(404);
    });

    it('US-06-12 AC-9: keeps every reason when several apply, the data first', async () => {
      const u = await unit();
      await example(u);
      const id = await stale(u);
      await h.setPayments(id, { amount: 80 * M });

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({
        route: 'BLOCKED',
        blockedReasons: ['PRICE_EXPIRED', 'OVER_RESERVE'],
        primaryCode: 'STALE_COST_EVIDENCE',
      });
      expect((await years(id))[0].code).toBe('INSUFFICIENT_BUDGET');
    });
  });

  // Removed: "a year that has ended makes no step" (AC-7). The year of a check is always the year of its day (QĐ-109e), so a year that has
  // ended is never judged, and CLOSED_OR_EXPIRED_BUDGET_PERIOD is no longer given.
});
