import { SpendHarness, Unit } from '../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface YearWire {
  year: number;
  code: string | null;
  cost: { amount: string };
  budget: { amount: string } | null;
  held: { amount: string } | null;
  spent: { amount: string } | null;
  remaining: { amount: string } | null;
  pending: { amount: string } | null;
  overridden: boolean;
}
interface DetailWire {
  step: {
    state: string;
    samePersonAsSpend: boolean;
    noIndependentReview: boolean;
    assignee: { employeeId: string } | null;
  };
  request: { state: string; offPlan: boolean };
  need: { decidedBy: { employeeId: string } } | null;
  cost: {
    estimatedCost: { amount: string };
    deductibleTax: { amount: string };
    nonDeductibleTax: { amount: string };
  } | null;
  decision: { decision: string; reason: string | null; overrideReason: string | null; bySubstitute: boolean } | null;
}

describe('the decision of the spending approver over PostgreSQL (US-06-01)', () => {
  let plan: string;
  let taxedPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    taxedPlan = await h.planOf(await h.subscription(10));
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

    return h.departmentWithHead(`P-A${counter}`);
  };
  /** The example of the stories: 100 million, 20 held, 40 spent, so 40 left, high value over half of it. */
  const example = async (extra: { held?: number; spent?: number; percent?: number } = {}) => {
    const u = await unit();
    const version = await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M, ...extra });

    return { u, version };
  };
  const detail = async (id: string, account = h.boss.account) =>
    h.dataOf<{ spendApproval: DetailWire }>(await h.approvalOf(id, account).expect(200)).spendApproval;
  const years = async (id: string, account = h.boss.account) =>
    h.dataOf<{ items: YearWire[] }>(await h.checkYears(id, account).expect(200)).items;
  const approve = (id: string, over: object = {}, account = h.boss.account) =>
    h.decideSpend(id, { decision: 'APPROVE', ...over }, account);
  const records = async (id: string) =>
    (
      await h.ctx.sql.query<{ decision: string; decider_role: string; reason: string | null }>(
        `SELECT decision, decider_role, reason FROM approval_records WHERE request_id = $1 AND step_id IN (SELECT id FROM access_request_steps WHERE kind = 'SPEND_APPROVAL') ORDER BY decided_at`,
        [id],
      )
    ).rows;
  const decided = async (id: string) =>
    (
      await h.ctx.sql.query<{ check_id: string | null; override_years: number[]; override_reason: string | null }>(
        `SELECT check_id, override_years, override_reason FROM spend_decisions WHERE request_id = $1`,
        [id],
      )
    ).rows;

  describe('what the approver sees (AC-1, AC-9, AC-10, AC-14)', () => {
    it('is the request, what the head confirmed and the figures of the budget with what the others that wait cost (AC-1)', async () => {
      const { u } = await example();
      const first = await h.waitingForApprover(u, plan, { amount: 15 * M });
      await h.waitingForApprover(u, plan, { amount: 15 * M });

      const queue = h.dataOf<{ items: Array<{ requestId: string; primaryCode: string; batchId: string | null }> }>(
        await h.approvals(h.boss.account, { pageSize: 100 }).expect(200),
      );
      const view = await detail(first);

      expect(queue.items.find((item) => item.requestId === first)).toMatchObject({ primaryCode: 'BUDGET_OK' });
      expect(queue.items.find((item) => item.requestId === first)?.batchId).not.toBeNull();
      expect(view).toMatchObject({
        step: { state: 'PENDING', assignee: { employeeId: h.boss.employeeId } },
        need: { decidedBy: { employeeId: u.head.employeeId } },
      });
      expect((await years(first))[0]).toMatchObject({
        code: 'BUDGET_OK',
        budget: { amount: String(100 * M) },
        held: { amount: String(20 * M) },
        spent: { amount: String(40 * M) },
        remaining: { amount: String(40 * M) },
        pending: { amount: String(15 * M) },
      });
    });

    it('counts as waiting only what the same Cost Center asks in the same year (AC-9)', async () => {
      const { u } = await example();
      const other = await example();
      const first = await h.waitingForApprover(u, plan, { amount: 15 * M });
      await h.waitingForApprover(other.u, plan, { amount: 30 * M });
      await h.budgetFor(u, { total: 100 * M, year: h.next });
      await h.waitingForApprover(u, plan, { year: h.next, dueOn: `${h.next}-02-10`, amount: 10 * M });

      expect((await years(first))[0].pending).toEqual({ amount: '0', currency: 'VND' });
      const second = await h.waitingForApprover(u, plan, { amount: 12 * M });
      expect((await years(second))[0].pending).toEqual({ amount: String(15 * M), currency: 'VND' });
    });

    it('shows the cost that falls on the company, with the tax that is deducted apart, and counts that cost as waiting (AC-14)', async () => {
      const { u } = await example({ percent: 100 });
      const first = await h.waitingForApprover(u, taxedPlan, { amount: 20 * M });
      const second = await h.waitingForApprover(u, taxedPlan, { amount: 5 * M });

      const view = await detail(first);

      // 20 million before tax, 2 million of tax that is deducted and 1 million that is not: the cost is 21, not 23.
      expect(view.cost).toMatchObject({
        estimatedCost: { amount: String(21 * M) },
        deductibleTax: { amount: String(2 * M) },
        nonDeductibleTax: { amount: String(1 * M) },
      });
      expect((await years(second))[0].pending).toEqual({ amount: String(21 * M), currency: 'VND' });
    });

    it('is closed to those who do not hold the step, and nothing of a request that waits for Finance is open to the approver (AC-8, AC-17)', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });
      const waiting = await h.waitingForApprover(u, plan, { amount: 30 * M }); // 75 % of 40 left: high value

      for (const account of [h.finance, u.head.account, h.it1, u.member.account]) {
        await h.approvalOf(id, account).expect(404);
      }
      expect(await h.steps(waiting, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
      const queue = h.dataOf<{ items: Array<{ requestId: string }> }>(
        await h.approvals(h.boss.account, { pageSize: 100 }).expect(200),
      );
      expect(queue.items.map((item) => item.requestId)).not.toContain(waiting);
      expect(queue.items.map((item) => item.requestId)).toContain(id);
    });
  });

  describe('software that was not in the catalog (AC-10)', () => {
    it('shows the level of control, the risk and the conclusion of the IT Admin, which the approver cannot change', async () => {
      const { u } = await example();
      const id = await h.staleRequest(u);
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date + 1 WHERE request_id = $1`,
        [id],
      );
      await h.sendOn([id], u.head.account).expect(201);

      const view = h.dataOf<{
        spendApproval: { assessment: Record<string, unknown>; request: { softwareName: string } };
      }>(await h.approvalOf(id, h.boss.account).expect(200)).spendApproval;

      expect(view.assessment).toMatchObject({
        classification: 'PAID_LICENSED',
        controlLevel: 'PARTIAL',
        controlRiskNote: 'No export of usage',
        equivalentTool: null,
      });
      expect(view.request.softwareName).toBe('Miro');
      await h.saveAssessment(id, { controlLevel: 'FULL' }, h.boss.account).expect(403);
      await h.completeAssessment(id, h.boss.account).expect(403);
    });
  });

  describe('approving and refusing (AC-2, AC-4, AC-12)', () => {
    it('approves, keeps the electronic record of the approver and the snapshot, and sends the request to the IT Admin (AC-2, AC-12)', async () => {
      const { u, version } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      const response = await approve(id).expect(200);

      expect(h.dataOf<{ spendApproval: DetailWire }>(response).spendApproval).toMatchObject({
        step: { state: 'APPROVED' },
        request: { state: 'AWAITING_EXECUTION' },
        decision: { decision: 'APPROVED', overrideReason: null, bySubstitute: false },
      });
      expect(await records(id)).toEqual([
        expect.objectContaining({ decision: 'APPROVED', decider_role: 'SPENDING_APPROVER', reason: null }),
      ]);
      const [kept] = await decided(id);
      expect(kept.check_id).not.toBeNull();
      // What the budget does afterwards does not change what the decision was made on.
      await h.commit(u, version.id, h.year, 30 * M, 'HELD');
      const after = (await years(id))[0];
      expect(after).toMatchObject({ remaining: { amount: String(40 * M) }, held: { amount: String(20 * M) } });
      const trigger = await h.ctx.sql.query<{ trigger: string }>(
        `SELECT trigger FROM request_budget_checks WHERE id = $1`,
        [kept.check_id],
      );
      expect(trigger.rows[0].trigger).toBe('SPEND_DECISION');
    });

    it('does not decide a step twice', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });
      await approve(id).expect(200);

      const again = await approve(id).expect(409);

      expect(h.codeOf(again)).toBe('SPEND.NO_SPEND_STEP');
      expect(await records(id)).toHaveLength(1);
    });

    it('refuses with a reason, ends the request as refused, and makes nothing after it (AC-4)', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      const missing = await h.decideSpend(id, { decision: 'REJECT' }, h.boss.account).expect(422);
      const blank = await h.decideSpend(id, { decision: 'REJECT', reason: '  ' }, h.boss.account).expect(422);
      const response = await h
        .decideSpend(id, { decision: 'REJECT', reason: 'Not this quarter' }, h.boss.account)
        .expect(200);

      expect([h.codeOf(missing), h.codeOf(blank)]).toEqual(['VALIDATION_ERROR', 'VALIDATION_ERROR']);
      expect(h.dataOf<{ spendApproval: DetailWire }>(response).spendApproval).toMatchObject({
        request: { state: 'REJECTED' },
        decision: { decision: 'REJECTED', reason: 'Not this quarter' },
      });
      expect(await records(id)).toEqual([
        expect.objectContaining({ decision: 'REJECTED', reason: 'Not this quarter' }),
      ]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'REJECTED' })]);
      const wire = h.dataOf<{ request: { state: string; spend: { stage: string; refusalReason: string } } }>(
        await h.fetch(id, u.member.account).expect(200),
      ).request;
      expect(wire).toMatchObject({ state: 'REJECTED', spend: { stage: 'REFUSED', refusalReason: 'Not this quarter' } });
    });

    it('is not for Finance, the head, the IT Admin or an Employee, and not for the person who asked (AC-8)', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      for (const account of [h.finance, u.head.account, h.it1]) {
        expect(h.codeOf(await approve(id, {}, account).expect(403))).toBe('SPEND.NOT_THE_ASSIGNEE');
      }
      expect(h.codeOf(await approve(id, {}, u.member.account).expect(403))).toBe('SPEND.OWN_REQUEST');
      await h.ctx.sql.query(`UPDATE access_requests SET requester_employee_id = $2 WHERE id = $1`, [
        id,
        h.boss.employeeId,
      ]);
      expect(h.codeOf(await approve(id).expect(403))).toBe('SPEND.OWN_REQUEST');
      expect(await records(id)).toEqual([]);
    });

    it('has two records of two decisions, each flagged as one person, when the same person holds both steps (AC-7)', async () => {
      const executive = await h.ctx.sql.query<{ id: string; cost_center_id: string }>(
        `SELECT id, cost_center_id FROM departments WHERE code = 'P-EXE'`,
      );
      const department = { id: executive.rows[0].id, code: 'P-EXE', unitId: executive.rows[0].cost_center_id };
      const exe: Unit = { department, head: h.boss, member: await h.staff(department, 'EXE-E9') };
      await h.budgetFor(exe, { total: 100 * M });
      const id = await h.paidRequest(exe, plan, { amount: 10 * M });

      await approve(id).expect(200);

      const all = await h.ctx.sql.query<{ kind: string; same_person_as_spend: boolean }>(
        `SELECT s.kind, s.same_person_as_spend FROM access_request_steps s WHERE s.request_id = $1 AND s.kind IN ('NEED', 'SPEND_APPROVAL')`,
        [id],
      );
      expect(all.rows.map((row) => [row.kind, row.same_person_as_spend]).sort()).toEqual([
        ['NEED', true],
        ['SPEND_APPROVAL', true],
      ]);
      const count = await h.ctx.sql.query(`SELECT 1 FROM approval_records WHERE request_id = $1`, [id]);
      expect(count.rowCount).toBe(2);
    });
  });

  describe('an exception is accepted by an override (AC-3, AC-5, AC-16, AC-21)', () => {
    /** A request of 45 million against 40 left: it went to Finance, who advised, and now waits for the approver. */
    const exception = async (extra: { amount?: number } = {}) => {
      const { u } = await example();
      const id = await h.paidRequest(u, plan, { amount: extra.amount ?? 45 * M });
      await h.sendOn([id], u.head.account).expect(201);
      await h
        .completeReview(id, {
          outcome: 'ASSESSED',
          opinion: 'Over by 5 million: accepted',
          direction: 'RECOMMEND_OVERRIDE',
        })
        .expect(200);

      return { u, id };
    };

    it('needs the override and its reason for a request that costs more than what is left, and keeps both (AC-5, AC-16)', async () => {
      const { id } = await exception();

      const missing = await approve(id).expect(422);
      const blank = await approve(id, { override: { reason: ' ', years: [h.year] } }).expect(422);
      const response = await approve(id, { override: { reason: 'Revision next month', years: [h.year] } }).expect(200);

      expect(h.codeOf(missing)).toBe('SPEND.OVERRIDE_REQUIRED');
      expect(h.detailsOf(missing)).toMatchObject({ years: [h.year] });
      expect(h.codeOf(blank)).toBe('VALIDATION_ERROR');
      expect(h.dataOf<{ spendApproval: DetailWire }>(response).spendApproval.decision).toMatchObject({
        decision: 'APPROVED',
        overrideReason: 'Revision next month',
      });
      expect(await decided(id)).toEqual([
        expect.objectContaining({ override_years: [h.year], override_reason: 'Revision next month' }),
      ]);
      expect(await years(id)).toEqual([
        expect.objectContaining({
          code: 'INSUFFICIENT_BUDGET',
          overridden: true,
          remaining: { amount: String(40 * M), currency: 'VND' },
        }),
      ]);
    });

    it('does not take an override that names other years, or one when there is nothing to override', async () => {
      const { id } = await exception();
      const { u } = await example();
      const ok = await h.waitingForApprover(u, plan, { amount: 15 * M });

      const mismatch = await approve(id, { override: { reason: 'Why', years: [h.next] } }).expect(422);
      const needless = await approve(ok, { override: { reason: 'Why', years: [h.year] } }).expect(422);

      expect(h.codeOf(mismatch)).toBe('SPEND.OVERRIDE_MISMATCH');
      expect(h.codeOf(needless)).toBe('SPEND.OVERRIDE_NOT_NEEDED');
      expect(await records(id)).toEqual([]);
      expect(await records(ok)).toEqual([]);
    });

    it('takes a year with no budget the same way, and says it has none and not that it has nothing (AC-3)', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 30 * M });
      await h.sendOn([id], u.head.account).expect(201);
      await h
        .completeReview(id, { outcome: 'ASSESSED', opinion: 'No budget: accepted', direction: 'RECOMMEND_OVERRIDE' })
        .expect(200);

      const view = (await years(id))[0];
      await approve(id).expect(422);
      await approve(id, { override: { reason: 'The budget comes in March', years: [h.year] } }).expect(200);

      expect(view).toMatchObject({ code: 'NO_ACTIVE_BUDGET', budget: null, remaining: null });
    });

    it('names, for a request over several years, the year that has no budget and no other, and marks it on the years (AC-21)', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 5_000_000 });
      const id = await h.paidRequest(u, plan, {
        schedule: [
          { dueOn: `${h.year}-11-01`, amount: 2_400_000, year: h.year },
          { dueOn: `${h.next}-11-01`, amount: 2_400_000, year: h.next },
        ],
      });
      await h.sendOn([id], u.head.account).expect(201);
      await h
        .completeReview(id, {
          outcome: 'ASSESSED',
          opinion: 'Next year has no budget yet',
          direction: 'RECOMMEND_OVERRIDE',
        })
        .expect(200);

      const wrongYear = await approve(id, { override: { reason: 'Why', years: [h.year] } }).expect(422);
      const missing = await approve(id).expect(422);
      await approve(id, { override: { reason: 'The budget of next year is being made', years: [h.next] } }).expect(200);

      expect(h.codeOf(wrongYear)).toBe('SPEND.OVERRIDE_MISMATCH');
      expect(h.detailsOf(missing)).toMatchObject({ years: [h.next] });
      expect((await years(id)).map((year) => [year.year, year.code, year.overridden])).toEqual([
        [h.year, 'BUDGET_OK', false],
        [h.next, 'NO_ACTIVE_BUDGET', true],
      ]);
    });
  });

  describe('a request that has to be checked again as it is decided (AC-18)', () => {
    it('goes back to Finance, with nothing decided, when it became an exception that Finance has not reviewed', async () => {
      const { u, version } = await example({ held: 10 * M, spent: 0 }); // 90 left
      const id = await h.waitingForApprover(u, plan, { amount: 20 * M });
      await h.commit(u, version.id, h.year, 75 * M, 'HELD'); // another request was approved: 15 left

      const response = await approve(id).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_NEEDS_FINANCE_REVIEW');
      expect(await records(id)).toEqual([]);
      expect(await decided(id)).toEqual([]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'CLOSED' })]);
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');

      await h
        .completeReview(id, { outcome: 'ASSESSED', opinion: 'Over now: accepted', direction: 'RECOMMEND_OVERRIDE' })
        .expect(200);

      expect((await years(id))[0]).toMatchObject({
        code: 'INSUFFICIENT_BUDGET',
        remaining: { amount: String(15 * M) },
      });
      await approve(id, { override: { reason: 'Accepted after the review', years: [h.year] } }).expect(200);
    });

    it('goes back to its head, with nothing decided, when its data is at fault now', async () => {
      const { u } = await example();
      const id = await h.staleRequest(u);
      // The quote was in force when it was sent on; the day it expires is a day later (made by hand to follow that).
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date + 1 WHERE request_id = $1`,
        [id],
      );
      await h.sendOn([id], u.head.account).expect(201);
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date - 1 WHERE request_id = $1`,
        [id],
      );

      const response = await approve(id).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');
      expect(h.detailsOf(response)).toMatchObject({ reason: 'STALE_COST_EVIDENCE' });
      expect(await records(id)).toEqual([]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'CLOSED' })]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('is not accepted by an override, whatever the approver says, when the data is at fault', async () => {
      const { u } = await example();
      const id = await h.staleRequest(u);
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date + 1 WHERE request_id = $1`,
        [id],
      );
      await h.sendOn([id], u.head.account).expect(201);
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date - 1 WHERE request_id = $1`,
        [id],
      );

      const response = await approve(id, { override: { reason: 'Never mind', years: [h.year] } }).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');
      expect(await records(id)).toEqual([]);
    });
  });
});
