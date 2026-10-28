import { SpendHarness, Unit } from '../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface ReviewWire {
  requestId: string;
  step: {
    state: string;
    waitingReason: string | null;
    assignee: { employeeId: string } | null;
    closedAt: string | null;
  };
  check: { primaryCode: string | null; number: number };
  review: {
    outcome: string;
    opinion: string | null;
    direction: string | null;
    reason: string | null;
    decidedBy: { employeeId: string };
  } | null;
}

describe('the review of Finance over PostgreSQL (US-06-13)', () => {
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

    return h.departmentWithHead(`P-R${counter}`);
  };
  /** A request of 45 million against 40 million left: it waits for the review of Finance. */
  const inReview = async (extra: { amount?: number; total?: number } = {}) => {
    const u = await unit();
    await h.budgetFor(u, { total: extra.total ?? 100 * M, held: 20 * M, spent: 40 * M });
    const id = await h.paidRequest(u, plan, { amount: extra.amount ?? 45 * M });
    await h.route(id, u.head.account);

    return { u, id };
  };
  const opinion = (direction = 'RECOMMEND_OVERRIDE') => ({
    outcome: 'ASSESSED',
    opinion: 'Over by 5 million: an exception that will be mended by a revision next month',
    direction,
  });
  const reviewOf = async (id: string, account = h.finance) =>
    h.dataOf<{ financeReview: ReviewWire }>(await h.reviewOf(id, account).expect(200)).financeReview;
  const reviewRows = async () => h.budgetRows('request_finance_reviews');

  describe('ending it with an opinion (AC-1, AC-2, AC-8, AC-12)', () => {
    it('keeps the result of the check, makes the step of the approver and shows him the opinion (AC-1, AC-8)', async () => {
      const { id } = await inReview();

      const response = await h.completeReview(id, opinion()).expect(200);

      expect(h.dataOf<{ financeReview: ReviewWire }>(response).financeReview).toMatchObject({
        step: { state: 'COMPLETED', assignee: { employeeId: h.finance.employeeId } },
        check: { primaryCode: 'INSUFFICIENT_BUDGET', number: 1 },
        review: {
          outcome: 'ASSESSED',
          direction: 'RECOMMEND_OVERRIDE',
          decidedBy: { employeeId: h.finance.employeeId },
        },
      });
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
      // The check was not made again and still says what it said; the approver reads the opinion next to it.
      expect(await h.budgetRows('request_budget_checks')).toBeGreaterThan(0);
      const forBoss = await reviewOf(id, h.boss.account);
      expect(forBoss).toMatchObject({
        check: { primaryCode: 'INSUFFICIENT_BUDGET' },
        review: { direction: 'RECOMMEND_OVERRIDE' },
      });
      expect(forBoss.review?.opinion).toContain('Over by 5 million');
    });

    it('is not an approval or a refusal, whatever it advises (AC-2)', async () => {
      const { id } = await inReview();

      await h.completeReview(id, opinion('RECOMMEND_REJECT')).expect(200);

      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toHaveLength(1);
      const records = await h.ctx.sql.query(`SELECT 1 FROM approval_records WHERE request_id = $1`, [id]);
      expect(records.rowCount).toBe(1); // the need step of the head, and nothing of Finance
    });

    it('has no way to approve or refuse the request (AC-2)', async () => {
      const { id } = await inReview();

      const approve = await h.decide(id, { decision: 'APPROVE' }, h.finance).expect(404);
      const refuse = await h.decide(id, { decision: 'REJECT', reason: 'No' }, h.finance).expect(404);

      expect([h.codeOf(approve), h.codeOf(refuse)]).toEqual(['ACCESS_REQUEST.NOT_FOUND', 'ACCESS_REQUEST.NOT_FOUND']);
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
    });

    it('sends a high value that has enough money straight on with the opinion, and needs no override (AC-12)', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const id = await h.paidRequest(u, plan, { amount: 25 * M });
      await h.route(id, u.head.account);

      await h
        .completeReview(id, { ...opinion('RECOMMEND_APPROVE'), opinion: 'Reviewed, enough money: approve' })
        .expect(200);

      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect((await reviewOf(id)).check.primaryCode).toBe('HIGH_VALUE');
    });
  });

  describe('what must be given (AC-3)', () => {
    it.each([
      ['no outcome', {}],
      ['an opinion with no text', { outcome: 'ASSESSED', direction: 'RECOMMEND_APPROVE' }],
      ['an opinion with a blank text', { outcome: 'ASSESSED', opinion: '  ', direction: 'RECOMMEND_APPROVE' }],
      ['an opinion with no direction', { outcome: 'ASSESSED', opinion: 'Fine' }],
      [
        'an opinion with a reason',
        { outcome: 'ASSESSED', opinion: 'Fine', direction: 'RECOMMEND_APPROVE', reason: 'x' },
      ],
      ['a give-back with no reason', { outcome: 'RETURN_TO_HEAD' }],
      ['a give-back with a blank reason', { outcome: 'RETURN_TO_HEAD', reason: ' ' }],
      ['a give-back that advises', { outcome: 'RETURN_TO_HEAD', reason: 'x', direction: 'RECOMMEND_APPROVE' }],
      ['a budget asked for with no reason', { outcome: 'NEEDS_BUDGET' }],
      ['an outcome nobody knows', { outcome: 'APPROVE' }],
    ])('does not save %s', async (_name, body) => {
      const { id } = await inReview();
      const before = await reviewRows();

      const response = await h.completeReview(id, body).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await reviewRows()).toBe(before);
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
    });
  });

  describe('who reviews, and when (AC-5, AC-6, AC-7)', () => {
    it('is nobody and is flagged when Finance is the one the request is for (AC-5)', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M });
      const id = await h.paidRequest(u, plan, { amount: 90 * M });
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        id,
        h.finance.employeeId,
      ]);

      await h.route(id, u.head.account);

      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({
          state: 'PENDING',
          assignee_employee_id: h.boss.employeeId,
          no_independent_review: true,
        }),
      ]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      const check = h.dataOf<{ budgetCheck: { noIndependentReview: boolean; primaryCode: string } }>(
        await h.checkOf(id, h.boss.account).expect(200),
      ).budgetCheck;
      expect(check).toMatchObject({ noIndependentReview: true, primaryCode: 'HIGH_VALUE' });
    });

    describe('with nobody holding the role of Finance (AC-6)', () => {
      afterEach(async () => {
        await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = NULL WHERE app_user_id = $1 AND role = 'FINANCE'`, [
          h.finance.appUserId,
        ]);
      });

      it('waits under control, is given to nobody else, and is taken by Finance when there is one', async () => {
        const u = await unit();
        await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
        const id = await h.paidRequest(u, plan, { amount: 45 * M });
        await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = 'FINANCE'`, [
          h.finance.appUserId,
        ]);

        await h.route(id, u.head.account);

        expect(await h.state(id)).toBe('WAITING_CONTROLLED');
        expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([
          expect.objectContaining({
            state: 'WAITING',
            assignee_employee_id: null,
            waiting_reason: 'NO_FINANCE_REVIEWER',
          }),
        ]);
        expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
        const wire = h.dataOf<{ request: { spend: { stage: string } } }>(await h.fetch(id, u.head.account).expect(200));
        expect(wire.request.spend.stage).toBe('WAITING_FINANCE_REVIEW');

        await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = NULL WHERE app_user_id = $1 AND role = 'FINANCE'`, [
          h.finance.appUserId,
        ]);
        await h.completeReview(id, opinion()).expect(200);

        expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([
          expect.objectContaining({ state: 'COMPLETED', assignee_employee_id: h.finance.employeeId }),
        ]);
        expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      });
    });

    it('leaves the queue of Finance when the request is withdrawn, and cannot then be ended (AC-7)', async () => {
      const { id } = await inReview();
      // What the withdrawal does to the step of the review is the work of the item that withdraws; the step it leaves is this.
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'CLOSED', decided_at = now(), assigned_at = COALESCE(assigned_at, now())
          WHERE request_id = $1 AND kind = 'FINANCE_REVIEW'`,
        [id],
      );

      const queue = h.dataOf<{ items: Array<{ requestId: string }> }>(
        await h.reviewQueue(h.finance, { pageSize: 100 }).expect(200),
      );
      const refused = await h.completeReview(id, opinion()).expect(409);

      expect(queue.items.map((item) => item.requestId)).not.toContain(id);
      expect(h.codeOf(refused)).toBe('SPEND.REVIEW_NOT_OPEN');
    });

    it('is ended once: of two endings at once the first in the queue ends it and the second finds none open', async () => {
      const { id } = await inReview();

      const [first, second] = await h.queuedOnRequest(id, [
        () => h.completeReview(id, opinion()),
        () => h.completeReview(id, opinion('RECOMMEND_APPROVE')),
      ]);

      expect([first.status, second.status]).toEqual([200, 409]);
      expect(h.codeOf(second)).toBe('SPEND.REVIEW_NOT_OPEN');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toHaveLength(1);
    });
  });

  describe('who reads and who ends it', () => {
    it('lists to Finance the open reviews, oldest first, with the first code and no figures of the budget (AC-9)', async () => {
      const { id } = await inReview();

      const queue = h.dataOf<{ items: Array<Record<string, unknown>> }>(
        await h.reviewQueue(h.finance, { pageSize: 100 }).expect(200),
      );

      const item = queue.items.find((row) => row.requestId === id);
      expect(item).toMatchObject({
        state: 'PENDING',
        primaryCode: 'INSUFFICIENT_BUDGET',
        planLineOverdue: false,
        amount: { amount: String(45 * M), currency: 'VND' },
      });
      expect(Object.keys(item ?? {})).not.toEqual(expect.arrayContaining(['remaining', 'budget', 'held']));
    });

    it('tells the head the request waits for Finance and nothing else of the check (AC-9)', async () => {
      const { u, id } = await inReview();

      const response = await h.fetch(id, u.head.account).expect(200);
      const text = JSON.stringify(response.body);

      expect(h.dataOf<{ request: { spend: object } }>(response).request.spend).toEqual({
        stage: 'WAITING_FINANCE_REVIEW',
        blockedReason: null,
        financeReturnReason: null,
        refusalReason: null,
      });
      expect(text).not.toMatch(/INSUFFICIENT_BUDGET|remaining|HIGH_VALUE|NO_ACTIVE_BUDGET/);
    });

    it('is closed to everybody but Finance: the head, the requester, the approver and the IT Admin', async () => {
      const { u, id } = await inReview();
      const body = opinion();

      for (const account of [u.head.account, u.member.account, h.boss.account, h.it1]) {
        await h.completeReview(id, body, account).expect(403);
        await h.reviewQueue(account).expect(403);
      }
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
    });

    it('is not read by the head, the requester or an approver who has no step of it', async () => {
      const { u, id } = await inReview();

      for (const account of [u.head.account, u.member.account, h.boss.account]) {
        await h.reviewOf(id, account).expect(404);
        await h.checkOf(id, account).expect(404);
        await h.checkYears(id, account).expect(404);
      }
    });
  });
});
