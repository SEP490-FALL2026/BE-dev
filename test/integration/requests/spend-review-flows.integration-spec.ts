import { SpendHarness, Unit } from '../../support/spend-harness';

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

  describe('giving it back to the head (AC-10)', () => {
    const inReview = async (amount = 45 * M) => {
      const u = await unit();
      // The threshold is 95 % here, so that 36 million of the 40 left is in order and 45 is over.
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
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
    /** A version Finance builds from a proposal of the head and sends, left for the approver to decide. */
    const sentVersion = async (u: Unit) => {
      const proposal = await h.budgetProposed(u.head, u.department.unitId, [h.line()], h.year);
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

    it('is checked again when the budget is approved: in order goes to the approver, still short goes to Finance', async () => {
      const u = await unit();
      const small = await waiting(u, 30 * M);
      const big = await waiting(u, 130 * M);
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

    it('is chosen for a year with too little when somebody heads the department (F33), and refused for a department with nobody at its head', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const short = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.route(short, u.head.account);

      await h
        .completeReview(short, { outcome: 'NEEDS_BUDGET', reason: 'A revision of the budget will cover it' })
        .expect(200);

      expect(await h.state(short)).toBe('AWAITING_BUDGET');

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
