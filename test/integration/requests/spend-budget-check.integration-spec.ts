import type { RoutingOutcome } from '../../../src/modules/requests/spend/spend-routing.service';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface YearRowWire {
  year: number;
  cost: { amount: string };
  code: string | null;
  budget: { amount: string } | null;
  held: { amount: string } | null;
  spent: { amount: string } | null;
  remaining: { amount: string } | null;
  shareBasisPoints: number | null;
}
interface CheckWire {
  route: string;
  primaryCode: string | null;
  staleCostEvidence: boolean;
  planLineOverdue: boolean;
  periodClosed: boolean;
  offPlan: boolean;
  noIndependentReview: boolean;
  bindingTotal: { amount: string };
  yearCount: number;
}

describe('the check of the budget of a request over PostgreSQL (US-06-12)', () => {
  let plan: string;
  let taxedPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10)); // 1 000 000 VND a seat a month; the specs write the payments they need
    taxedPlan = await h.planOf(await h.subscription(10));
    // Only tax that is deducted, so that the cost of a payment is the payment (a second vendor has a tax that is not).
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    await h
      .declareTaxProfile((await h.vendorOf(taxedPlan)).id, [
        { taxType: 'GTGT', ratePercent: '10', deductible: true },
        { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false },
      ])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-K${counter}`);
  };
  /** The budget of the example of the stories: 100 million, 20 held, 40 spent, so 40 left, high value over half of it. */
  const example = (u: Unit, extra: Record<string, number> = {}) =>
    h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M, ...extra });
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

  describe('what the check gives and where it sends the request', () => {
    it('is BUDGET_OK under the share of what is left, and the spending approver is given the step (AC-1)', async () => {
      const u = await unit();
      await example(u);
      const id = await h.paidRequest(u, plan, { amount: 15 * M });

      const outcome = await checked(id, u);

      expect(outcome.route).toBe('SPEND_APPROVAL');
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([]);
      expect(await checkWire(id)).toMatchObject({ route: 'SPEND_APPROVAL', primaryCode: 'BUDGET_OK', yearCount: 1 });
      expect(await years(id)).toEqual([
        expect.objectContaining({
          year: h.year,
          code: 'BUDGET_OK',
          budget: { amount: String(100 * M), currency: 'VND' },
          held: { amount: String(20 * M), currency: 'VND' },
          spent: { amount: String(40 * M), currency: 'VND' },
          remaining: { amount: String(40 * M), currency: 'VND' },
          shareBasisPoints: 3750,
        }),
      ]);
    });

    it('never approves or refuses: the only decision of the request is the need step (AC-14)', async () => {
      const u = await unit();
      await example(u);
      const ok = await h.paidRequest(u, plan, { amount: 15 * M });
      const over = await h.paidRequest(u, plan, { amount: 45 * M });

      await checked(ok, u);
      await checked(over, u);

      expect(await approvals(ok)).toBe(1);
      expect(await approvals(over)).toBe(1);
    });

    it('is HIGH_VALUE over the share of what is left even when the money is there, and the approver has no step yet (AC-2)', async () => {
      const u = await unit();
      await example(u);
      const id = await h.paidRequest(u, plan, { amount: 25 * M });

      const outcome = await checked(id, u);

      expect(outcome.route).toBe('FINANCE_REVIEW');
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.finance.employeeId }),
      ]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await checkWire(id)).toMatchObject({ primaryCode: 'HIGH_VALUE' });
      expect((await years(id))[0]).toMatchObject({ code: 'HIGH_VALUE', shareBasisPoints: 6250 });
      // The spending approver has nothing of this request to open, nor to refuse (INF-12).
      await h.checkOf(id, h.boss.account).expect(404);
    });

    it('is HIGH_VALUE over the amount of the version, whatever the share (AC-3)', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, percent: 50, amountThreshold: 20 * M });
      const id = await h.paidRequest(u, plan, { amount: 22 * M });

      await checked(id, u);

      expect((await years(id))[0]).toMatchObject({ code: 'HIGH_VALUE', shareBasisPoints: 2200 });
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
    });

    it('is INSUFFICIENT_BUDGET over what is left, which is no hard stop: it goes to Finance (AC-4)', async () => {
      const u = await unit();
      await example(u);
      const id = await h.paidRequest(u, plan, { amount: 45 * M });

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({ route: 'FINANCE_REVIEW', primaryCode: 'INSUFFICIENT_BUDGET' });
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
    });

    it('says no budget, not a budget of nothing, for a year with none (AC-5)', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 10 * M });

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({ route: 'FINANCE_REVIEW', primaryCode: 'NO_ACTIVE_BUDGET' });
      expect(await years(id)).toEqual([
        expect.objectContaining({ code: 'NO_ACTIVE_BUDGET', budget: null, held: null, spent: null, remaining: null }),
      ]);
    });

    it('sends a plan line whose window has gone by to Finance although the money is there (AC-6)', async () => {
      const u = await unit();
      const version = await example(u);
      const id = await h.paidRequest(u, plan, { amount: 10 * M });
      await h.attachLine(id, version.id, 1);
      await h.ctx.sql.query(
        `UPDATE budget_version_lines SET window_from = $2::date, window_to = $3::date WHERE version_id = $1 AND position = 1`,
        [version.id, `${h.year}-01-01`, `${h.year}-03-31`],
      );

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({
        route: 'FINANCE_REVIEW',
        planLineOverdue: true,
        primaryCode: 'PLAN_LINE_OVERDUE',
      });
      expect((await years(id))[0].code).toBe('BUDGET_OK');
    });

    it('does not send a plan line whose window is still to come anywhere', async () => {
      const u = await unit();
      const version = await example(u);
      const id = await h.paidRequest(u, plan, { amount: 10 * M });
      await h.attachLine(id, version.id, 1);

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({ route: 'SPEND_APPROVAL', planLineOverdue: false });
    });

    it('treats a request outside the plan as information only (AC-10)', async () => {
      const u = await unit();
      await example(u);
      const id = await h.paidRequest(u, plan, { amount: 10 * M });
      await h.ctx.sql.query(`UPDATE access_requests SET off_plan = true WHERE id = $1`, [id]);

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({ route: 'SPEND_APPROVAL', offPlan: true, primaryCode: 'BUDGET_OK' });
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([]);
    });
  });

  describe('problems of the data stop the request where it is (AC-7, AC-8, AC-9)', () => {
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

    it('a year that has ended makes no step and the request stays in the queue of its head (AC-7)', async () => {
      const u = await unit();
      await example(u);
      const id = await h.paidRequest(u, plan, { year: h.year - 1, dueOn: `${h.year - 1}-12-20`, amount: 20 * M });

      const outcome = await checked(id, u);

      expect(outcome.route).toBe('BLOCKED');
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await checkWire(id)).toMatchObject({
        route: 'BLOCKED',
        periodClosed: true,
        primaryCode: 'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
      });
      expect((await years(id))[0]).toMatchObject({ code: null, remaining: null });
      // The head reads why, and nothing of the budget (INF-06).
      const wire = h.dataOf<{ request: { spend: object } }>(await h.fetch(id, u.head.account).expect(200)).request;
      expect(wire.spend).toEqual({
        stage: 'BLOCKED',
        blockedReason: 'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
        financeReturnReason: null,
        refusalReason: null,
      });
      await h.checkOf(id, u.head.account).expect(404);
    });

    it('a quote that has expired makes no step either (AC-8)', async () => {
      const u = await unit();
      await example(u);
      const id = await stale(u);

      const outcome = await checked(id, u);

      expect(outcome.route).toBe('BLOCKED');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([]);
      expect(await checkWire(id)).toMatchObject({ staleCostEvidence: true, primaryCode: 'STALE_COST_EVIDENCE' });
      const wire = h.dataOf<{ request: { spend: { stage: string; blockedReason: string } } }>(
        await h.fetch(id, u.head.account).expect(200),
      ).request;
      expect(wire.spend).toMatchObject({ stage: 'BLOCKED', blockedReason: 'STALE_COST_EVIDENCE' });
    });

    it('records both when both apply, and handles the data first (AC-9)', async () => {
      const u = await unit();
      await example(u);
      const id = await stale(u);
      await h.setPayments(id, { amount: 45 * M });

      await checked(id, u);

      expect(await checkWire(id)).toMatchObject({
        route: 'BLOCKED',
        staleCostEvidence: true,
        primaryCode: 'STALE_COST_EVIDENCE',
      });
      expect((await years(id))[0].code).toBe('INSUFFICIENT_BUDGET');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([]);
    });
  });
});
