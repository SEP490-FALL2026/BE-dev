import { SpendHarness, Unit } from '../../support/spend-harness';
import type { VersionWire } from '../../support/budget-harness';

const h = new SpendHarness();
const M = 1_000_000;

describe('what follows the review of Finance over PostgreSQL (US-06-13 AC-4, AC-10, AC-11)', () => {
  let plan: string;
  let counter = 0;

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

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-F${counter}`);
  };
  const opinion = { outcome: 'ASSESSED', opinion: 'Reviewed: an exception', direction: 'RECOMMEND_OVERRIDE' };
  const checks = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ number: number; trigger: string; route: string; plan_line_overdue: boolean }>(
        `SELECT number, trigger, route, plan_line_overdue FROM request_budget_checks WHERE request_id = $1 ORDER BY number`,
        [requestId],
      )
    ).rows;
  const reviews = async (requestId: string) =>
    (
      await h.ctx.sql.query<{
        outcome: string;
        reason: string | null;
        opinion: string | null;
        decided_by_employee_id: string;
      }>(
        `SELECT outcome, reason, opinion, decided_by_employee_id FROM request_finance_reviews WHERE request_id = $1 ORDER BY decided_at`,
        [requestId],
      )
    ).rows;
  const headWire = async (id: string, u: Unit) =>
    h.dataOf<{
      request: {
        spend: {
          stage: string;
          blockedReason: string | null;
          financeReturnReason: string | null;
          refusalReason: string | null;
        };
      };
    }>(await h.fetch(id, u.head.account).expect(200)).request.spend;

  describe('a plan line that is overdue (AC-4)', () => {
    /** A request of the amount attached to the first line of a budget whose window has gone by, and sent to Finance. */
    const overdue = async (amount: number) => {
      const u = await unit();
      const version = await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const id = await h.paidRequest(u, plan, { amount });
      await h.attachLine(id, version.id, 1);
      await h.ctx.sql.query(
        `UPDATE budget_version_lines SET window_from = $2::date, window_to = $3::date WHERE version_id = $1 AND position = 1`,
        [version.id, `${h.year}-01-01`, `${h.year}-03-31`],
      );
      await h.route(id, u.head.account);

      return { u, id, version };
    };
    const move = (version: VersionWire) =>
      h.moveWindow(version.id, 1, {
        windowFrom: `${h.year}-11-01`,
        windowTo: `${h.year}-12-31`,
        reason: 'Purchase put off to the fourth quarter',
      });

    it('cannot be ended with an opinion while the line is not updated, and no step is made for the approver', async () => {
      const { id } = await overdue(10 * M);

      const response = await h.completeReview(id, opinion).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.PLAN_LINE_NOT_UPDATED');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
    });

    it('ends the review when Finance moves the window, checks again as a new check, and goes on when it is in order', async () => {
      const { id, version } = await overdue(10 * M);

      await move(version).expect(200);

      expect(await reviews(id)).toEqual([
        expect.objectContaining({
          outcome: 'LINE_UPDATED',
          reason: 'Purchase put off to the fourth quarter',
          decided_by_employee_id: h.finance.employeeId,
        }),
      ]);
      expect(await checks(id)).toEqual([
        expect.objectContaining({ number: 1, trigger: 'SUBMISSION', route: 'FINANCE_REVIEW', plan_line_overdue: true }),
        expect.objectContaining({
          number: 2,
          trigger: 'PLAN_LINE_MOVED',
          route: 'SPEND_APPROVAL',
          plan_line_overdue: false,
        }),
      ]);
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'COMPLETED' })]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      const history = h.dataOf<{ items: Array<{ reason: string }> }>(await h.lineChanges(version.id, 1).expect(200));
      expect(history.items).toHaveLength(1);
    });

    it('opens a new review when the request is still out of the ordinary after the line is moved, and no step for the approver', async () => {
      const { id, version } = await overdue(30 * M); // 75 % of the 40 million left: high value

      await move(version).expect(200);

      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([
        expect.objectContaining({ state: 'COMPLETED' }),
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.finance.employeeId }),
      ]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
      expect((await checks(id)).map((check) => [check.number, check.route])).toEqual([
        [1, 'FINANCE_REVIEW'],
        [2, 'FINANCE_REVIEW'],
      ]);
      // The new review can be ended with an opinion now that the line is in order.
      await h.completeReview(id, opinion).expect(200);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });

    it('can be given back to the head instead, who then has it in the queue with the reason', async () => {
      const { u, id } = await overdue(10 * M);

      await h
        .completeReview(id, {
          outcome: 'RETURN_TO_HEAD',
          reason: 'Attach it to the line of the third quarter or to none',
        })
        .expect(200);

      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await headWire(id, u)).toEqual({
        stage: 'RETURNED_BY_FINANCE',
        blockedReason: null,
        financeReturnReason: 'Attach it to the line of the third quarter or to none',
        refusalReason: null,
      });
    });

    it('leaves alone a request attached to another line, and one that is not under review', async () => {
      const { id, version, u } = await overdue(10 * M);
      const other = await h.paidRequest(u, plan, { amount: 10 * M });
      await h.attachLine(other, version.id, 1);
      const elsewhere = await h.paidRequest(u, plan, { amount: 10 * M });
      await h.attachLine(elsewhere, version.id, 2);

      await move(version).expect(200);

      expect(await h.state(other)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.state(elsewhere)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await checks(other)).toEqual([]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });
  });

  describe('giving it back to the head (AC-10)', () => {
    const inReview = async (amount = 45 * M) => {
      const u = await unit();
      // The threshold is 95 % here, so that 36 million of the 40 left is in order and 45 is over.
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M, percent: 95 });
      const id = await h.paidRequest(u, plan, { amount });
      await h.route(id, u.head.account);

      return { u, id };
    };
    const giveBack = (id: string) =>
      h.completeReview(id, {
        outcome: 'RETURN_TO_HEAD',
        reason: 'Short by 5 million: reduce the scope or move it to next year',
      });

    it('ends the review with that outcome, makes no step for the approver, and the head reads the reason and no figure', async () => {
      const { u, id } = await inReview();

      await giveBack(id).expect(200);

      expect(await reviews(id)).toEqual([expect.objectContaining({ outcome: 'RETURNED_TO_HEAD' })]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      const wire = await h.fetch(id, u.head.account).expect(200);
      expect(h.dataOf<{ request: { spend: object } }>(wire).request.spend).toEqual({
        stage: 'RETURNED_BY_FINANCE',
        blockedReason: null,
        financeReturnReason: 'Short by 5 million: reduce the scope or move it to next year',
        refusalReason: null,
      });
      expect(JSON.stringify(wire.body)).not.toMatch(/INSUFFICIENT_BUDGET|remaining/);
    });

    it('is checked again as a whole when it is sent again, and goes to the approver when it is in order, with the history kept', async () => {
      const { u, id } = await inReview();
      await giveBack(id).expect(200);

      await h.setPayments(id, { amount: 36 * M }); // one beneficiary fewer
      const outcome = await h.route(id, u.head.account);

      expect(outcome).toMatchObject({ status: 'ROUTED', route: 'SPEND_APPROVAL' });
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'COMPLETED' })]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
      expect((await checks(id)).map((check) => [check.number, check.route])).toEqual([
        [1, 'FINANCE_REVIEW'],
        [2, 'SPEND_APPROVAL'],
      ]);
      expect(await reviews(id)).toHaveLength(1);
      expect((await headWire(id, u)).stage).toBe('WAITING_SPEND_DECISION');
    });

    it('goes to Finance again, in a review of its own, when it is still over after it is sent again', async () => {
      const { u, id } = await inReview();
      await giveBack(id).expect(200);

      await h.setPayments(id, { amount: 42 * M });
      await h.route(id, u.head.account);

      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([
        expect.objectContaining({ state: 'COMPLETED' }),
        expect.objectContaining({ state: 'PENDING' }),
      ]);
      expect((await headWire(id, u)).stage).toBe('WAITING_FINANCE_REVIEW');
    });
  });

  describe('waiting for a budget to be made (AC-11)', () => {
    const waiting = async (u: Unit, amount: number) => {
      const id = await h.paidRequest(u, plan, { amount });
      await h.route(id, u.head.account);
      await h
        .completeReview(id, { outcome: 'NEEDS_BUDGET', reason: 'Make the budget of the year for this Cost Center' })
        .expect(200);

      return id;
    };
    const window = (year: number) => ({
      windowFrom: `${year}-12-01`,
      windowTo: `${year}-12-31`,
      quoteValidUntil: undefined,
    });
    /** A version Finance builds from a proposal of the head and sends, left for the approver to decide. */
    const sentVersion = async (u: Unit) => {
      const proposal = await h.budgetProposed(u.head, u.department.unitId, [h.line(window(h.year))], h.year);
      const version = await h.built(proposal.id, { base: h.money(100 * M), reserve: h.money(0) });
      await h.sendVersion(version.id).expect(200);

      return version;
    };

    it('waits under control with no step for the approver, and the head reads that it waits for the budget', async () => {
      const u = await unit();
      const id = await waiting(u, 30 * M);

      expect(await h.state(id)).toBe('AWAITING_BUDGET');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'COMPLETED' })]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect((await headWire(id, u)).stage).toBe('WAITING_BUDGET');
      expect(await reviews(id)).toEqual([expect.objectContaining({ outcome: 'BUDGET_REVISION_NEEDED' })]);
    });

    it('is checked again when the budget is approved: in order goes to the approver, still out goes to Finance', async () => {
      const u = await unit();
      const small = await waiting(u, 30 * M);
      const big = await waiting(u, 95 * M);
      const other = await unit();
      const elsewhere = await waiting(other, 30 * M);

      await h.budgetFor(u, { total: 100 * M });

      expect(await h.state(small)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(small, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
      expect((await checks(small)).map((check) => [check.number, check.trigger, check.route])).toEqual([
        [1, 'SUBMISSION', 'FINANCE_REVIEW'],
        [2, 'BUDGET_VERSION_APPROVED', 'SPEND_APPROVAL'],
      ]);
      expect(await h.state(big)).toBe('AWAITING_FINANCE_REVIEW');
      expect(await h.steps(big, 'FINANCE_REVIEW')).toEqual([
        expect.objectContaining({ state: 'COMPLETED' }),
        expect.objectContaining({ state: 'PENDING' }),
      ]);
      // A request of another Cost Center keeps waiting for its own budget.
      expect(await h.state(elsewhere)).toBe('AWAITING_BUDGET');
      expect(await checks(elsewhere)).toHaveLength(1);
    });

    it.each([
      ['refuses it', { decision: 'REJECT', reason: 'Too high for the year' }],
      ['sends it back to Finance', { decision: 'REQUEST_CHANGES', reason: 'Lower the reserve' }],
    ])(
      'keeps waiting, with no new review, when the approver %s, and Finance moves it from there (F65, QĐ-92a)',
      async (_name, decision) => {
        const u = await unit();
        const id = await waiting(u, 30 * M);
        const version = await sentVersion(u);

        await h.decideVersion(version.id, decision, h.boss.account).expect(200);

        expect(await h.state(id)).toBe('AWAITING_BUDGET');
        expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'COMPLETED' })]);
        expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
        expect(await checks(id)).toHaveLength(1); // the check is the same: the year still has no budget
        await h
          .completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'No budget this year: carry it to the next' })
          .expect(200);
        expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      },
    );

    it('can also be ended with an opinion after the refusal, as a check of its own, and the approver has the step', async () => {
      const u = await unit();
      const id = await waiting(u, 30 * M);
      const version = await sentVersion(u);
      await h.decideVersion(version.id, { decision: 'REJECT', reason: 'Not now' }, h.boss.account).expect(200);

      await h.completeReview(id, opinion).expect(200);

      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect((await checks(id)).map((check) => [check.number, check.trigger])).toEqual([
        [1, 'SUBMISSION'],
        [2, 'FINANCE_OUTCOME_WHILE_WAITING'],
      ]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
    });

    it('is chosen for a year with too little when somebody heads the department (F33), and refused for a year that is only of high value, and for a department with nobody at its head', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const short = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.route(short, u.head.account);

      await h
        .completeReview(short, { outcome: 'NEEDS_BUDGET', reason: 'A revision of the budget will cover it' })
        .expect(200);

      expect(await h.state(short)).toBe('AWAITING_BUDGET');

      // Enough is left, and the request is only of high value: there is no budget to make.
      const calm = await unit();
      await h.budgetFor(calm, { total: 100 * M, held: 20 * M, spent: 40 * M, percent: 10 });
      const covered = await h.paidRequest(calm, plan, { amount: 30 * M });
      await h.route(covered, calm.head.account);

      const first = await h.completeReview(covered, { outcome: 'NEEDS_BUDGET', reason: 'Nothing to make' }).expect(409);

      expect(h.codeOf(first)).toBe('SPEND.NO_BUDGET_TO_MAKE');

      // The head of the department leaves after the need was approved: nobody is left to propose a budget (a department with no head
      // cannot get here otherwise, since its need step waits for a head, QĐ-93c).
      const headless = await unit();
      await h.budgetFor(headless, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const sent = { id: await h.paidRequest(headless, plan, { amount: 45 * M }) };
      await h.route(sent.id, headless.head.account);
      await h.withoutHead(headless.department);

      const second = await h.completeReview(sent.id, { outcome: 'NEEDS_BUDGET', reason: 'Make one' }).expect(409);

      expect(h.codeOf(second)).toBe('SPEND.NO_HEAD_TO_PROPOSE');
      expect(await h.state(sent.id)).toBe('AWAITING_FINANCE_REVIEW');
    });
  });
});
