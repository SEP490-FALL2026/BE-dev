import type { Response } from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { FinanceReviewService } from '../../../src/modules/requests/finance-review/finance-review.service';
import { SpendBudgetListener } from '../../../src/modules/requests/finance-review/spend-budget.listener';
import { SpendNotFinanceError } from '../../../src/modules/requests/spend/spend.errors';
import { waitForLockWaiters } from '../../support/lock-wait';
import { StatusHarness } from '../../support/status-harness';
import type { Unit } from '../../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, Tasks 4.4, 4.5 and 4.8 (F65, F33, F32; spec J.3): a request that waits for a version of the
 * budget keeps waiting when the version is refused, sent back or expires, Finance is told, and Finance moves the request from there
 * with `financeReviewComplete` (a review step is opened and completed in the one call), under the independence rules of the review.
 */
const h = new StatusHarness();
const M = 1_000_000;

describe('the request that waits for a version of the budget (integration, real PostgreSQL)', () => {
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

    return h.departmentWithHead(`P-AW${counter}`);
  };
  /** A request of 30 million of a Cost Center with no budget: Finance asked for one and the request waits. */
  const waiting = async (u: Unit, amount = 30 * M) => {
    const id = await h.paidRequest(u, plan, { amount });
    await h.route(id, u.head.account);
    await h.completeReview(id, { outcome: 'NEEDS_BUDGET', reason: 'Make the budget of the year' }).expect(200);

    return id;
  };
  const purchaseWindow = { windowFrom: `${h.year}-12-01`, windowTo: `${h.year}-12-31`, quoteValidUntil: undefined };
  /** A version Finance builds from a proposal of the head and sends, left for the approver to decide. */
  const sentVersion = async (u: Unit) => {
    const proposal = await h.budgetProposed(u.head, u.department.unitId, [h.line(purchaseWindow)], h.year);
    const version = await h.built(proposal.id, { base: h.money(100 * M), reserve: h.money(0) });
    await h.sendVersion(version.id).expect(200);

    return version;
  };
  const reviews = async (id: string) =>
    (
      await h.ctx.sql.query<{ outcome: string; decided_by_employee_id: string; check_id: string }>(
        `SELECT outcome::text, decided_by_employee_id, check_id FROM request_finance_reviews WHERE request_id = $1 ORDER BY decided_at`,
        [id],
      )
    ).rows;
  const checks = async (id: string) =>
    (
      await h.ctx.sql.query<{ number: number; trigger: string; route: string; period_closed: boolean; id: string }>(
        `SELECT id, number, trigger::text, route::text, period_closed FROM request_budget_checks WHERE request_id = $1 ORDER BY number`,
        [id],
      )
    ).rows;
  const stage = async (id: string, u: Unit) =>
    h.dataOf<{ request: { spend: { stage: string } | null } }>(await h.fetch(id, u.head.account).expect(200)).request
      .spend?.stage;

  describe('the version it waits for ends without being approved (F65, QĐ-92a)', () => {
    it.each([
      ['REJECT', { decision: 'REJECT', reason: 'Too high for the year' }, 'REJECTED'],
      ['REQUEST_CHANGES', { decision: 'REQUEST_CHANGES', reason: 'Lower the reserve' }, 'CHANGES_REQUESTED'],
    ])(
      'keeps waiting, opens no review and makes no spend step when the approver decides %s, and tells Finance',
      async (_name, decision, ended) => {
        const u = await unit();
        const id = await waiting(u);
        const version = await sentVersion(u);

        await h.decideVersion(version.id, decision, h.boss.account).expect(200);

        expect(await h.state(id)).toBe('AWAITING_BUDGET');
        expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'COMPLETED' })]);
        expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
        expect(await checks(id)).toHaveLength(1);
        expect((await h.audit('ACCESS_REQUEST.BUDGET_VERSION_ENDED', id))[0]).toMatchObject({
          actor_kind: 'USER',
          after: {
            requestId: id,
            versionId: version.id,
            costCenterId: u.department.unitId,
            year: h.year,
            decision: ended,
          },
        });
        await h.project();
        const told = (await h.noticesAbout(id)).filter((row) => row.code === 'REQUEST_BUDGET_VERSION_ENDED');
        expect(told.map((row) => [row.recipient_employee_id, row.params])).toEqual([
          [
            h.finance.employeeId,
            { requestId: id, versionId: version.id, costCenterId: u.department.unitId, year: h.year, decision: ended },
          ],
        ]);
        expect(await stage(id, u)).toBe('WAITING_BUDGET');
      },
    );

    it('keeps waiting when the version expires before it ever became current, and the system is the actor of the event', async () => {
      const u = await unit();
      const id = await waiting(u);
      const version = await sentVersion(u);
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const listener = h.ctx.app.get(SpendBudgetListener, { strict: false });

      await runner.run((tx) =>
        listener.versionExpired(tx, { costCenterId: u.department.unitId, year: h.year, versionId: version.id }),
      );

      expect(await h.state(id)).toBe('AWAITING_BUDGET');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toHaveLength(1);
      expect((await h.audit('ACCESS_REQUEST.BUDGET_VERSION_ENDED', id))[0]).toMatchObject({
        actor_kind: 'SYSTEM',
        after: { decision: 'EXPIRED' },
      });
    });

    it('does not touch a request of another Cost Center or a request that waits for another year', async () => {
      const u = await unit();
      const other = await unit();
      const elsewhere = await waiting(other);
      const version = await sentVersion(u);

      await h.decideVersion(version.id, { decision: 'REJECT', reason: 'Not now' }, h.boss.account).expect(200);

      expect(await h.audit('ACCESS_REQUEST.BUDGET_VERSION_ENDED', elsewhere)).toEqual([]);
    });
  });

  describe('Finance moves it with financeReviewComplete while it waits (J.3)', () => {
    it('gives it back to the head: a review step is opened and completed, the record is attached to the newest check, and it leaves the batch', async () => {
      const u = await unit();
      const id = await waiting(u);
      const newest = (await checks(id)).at(-1);

      const response = await h
        .completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'No budget this year: carry it to the next' })
        .expect(200);

      expect(
        h.dataOf<{ financeReview: { step: { state: string }; review: { outcome: string } } }>(response).financeReview,
      ).toMatchObject({ step: { state: 'COMPLETED' }, review: { outcome: 'RETURNED_TO_HEAD' } });
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([
        expect.objectContaining({ state: 'COMPLETED' }),
        expect.objectContaining({ state: 'COMPLETED', assignee_employee_id: h.finance.employeeId }),
      ]);
      expect(await reviews(id)).toEqual([
        expect.objectContaining({ outcome: 'BUDGET_REVISION_NEEDED' }),
        expect.objectContaining({
          outcome: 'RETURNED_TO_HEAD',
          decided_by_employee_id: h.finance.employeeId,
          check_id: newest?.id,
        }),
      ]);
      expect(await stage(id, u)).toBe('RETURNED_BY_FINANCE');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
    });

    it('gives an opinion while the year is still open: the request is checked again as a check of its own and the approver gets the step with the opinion', async () => {
      const u = await unit();
      const id = await waiting(u);

      await h
        .completeReview(id, {
          outcome: 'ASSESSED',
          opinion: 'An exception: the budget is coming',
          direction: 'RECOMMEND_OVERRIDE',
        })
        .expect(200);

      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
      // No review of Finance is opened again, though the year still has no budget.
      expect(await h.steps(id, 'FINANCE_REVIEW')).toHaveLength(2);
      expect((await checks(id)).map((check) => [check.number, check.trigger, check.route])).toEqual([
        [1, 'SUBMISSION', 'FINANCE_REVIEW'],
        [2, 'FINANCE_OUTCOME_WHILE_WAITING', 'FINANCE_REVIEW'],
      ]);
      expect((await reviews(id)).map((review) => review.outcome)).toEqual(['BUDGET_REVISION_NEEDED', 'ASSESSED']);
    });

    it('gives an opinion after the year closed: the data code sends it back to the queue of the head and no spend step is made (QĐ-92a)', async () => {
      const u = await unit();
      const id = await waiting(u);
      await h.setPayments(id, { year: h.year - 1, amount: 30 * M });

      await h
        .completeReview(id, {
          outcome: 'ASSESSED',
          opinion: 'Nothing to decide on a closed year',
          direction: 'RECOMMEND_REJECT',
        })
        .expect(200);

      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect((await checks(id)).at(-1)).toMatchObject({
        trigger: 'FINANCE_OUTCOME_WHILE_WAITING',
        route: 'BLOCKED',
        period_closed: true,
      });
      expect(await h.steps(id, 'FINANCE_REVIEW')).toHaveLength(2);
    });

    it('does not ask for a budget twice: NEEDS_BUDGET is refused and writes nothing', async () => {
      const u = await unit();
      const id = await waiting(u);
      const rows = await reviews(id);

      const refused = await h.completeReview(id, { outcome: 'NEEDS_BUDGET', reason: 'Again' }).expect(409);

      expect(h.codeOf(refused)).toBe('SPEND.ALREADY_AWAITING_BUDGET');
      expect(await reviews(id)).toEqual(rows);
      expect(await h.steps(id, 'FINANCE_REVIEW')).toHaveLength(1);
      expect(await h.state(id)).toBe('AWAITING_BUDGET');
    });

    it('answers the second call after a success with REVIEW_NOT_OPEN and writes no second record', async () => {
      const u = await unit();
      const id = await waiting(u);
      await h.completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'Carry it' }).expect(200);

      const again = await h.completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'Carry it' }).expect(409);

      expect(h.codeOf(again)).toBe('SPEND.REVIEW_NOT_OPEN');
      expect(await reviews(id)).toHaveLength(2);
    });

    it('refuses an opinion while the plan line is overdue, as on a review, and leaves it waiting', async () => {
      const u = await unit();
      const id = await waiting(u);
      // The checks are append-only (INV-05): the newest check of the request is a new one, as a check made again is, with the line overdue.
      await h.ctx.sql.query(
        `INSERT INTO request_budget_checks (id, organization_id, request_id, number, trigger, route, stale_cost_evidence,
                                            plan_line_overdue, period_closed, off_plan, currency, binding_total_minor)
         SELECT gen_random_uuid(), organization_id, request_id, number + 1, 'PLAN_LINE_MOVED'::"BudgetCheckTrigger", route,
                stale_cost_evidence, true, period_closed, off_plan, currency, binding_total_minor
           FROM request_budget_checks WHERE request_id = $1 ORDER BY number DESC LIMIT 1`,
        [id],
      );

      const refused = await h
        .completeReview(id, { outcome: 'ASSESSED', opinion: 'Over', direction: 'RECOMMEND_APPROVE' })
        .expect(409);

      expect(h.codeOf(refused)).toBe('SPEND.PLAN_LINE_NOT_UPDATED');
      expect(await h.state(id)).toBe('AWAITING_BUDGET');
    });
  });

  describe('who may end the review (F65, F32, SoD-8)', () => {
    it('refuses everybody but Finance, by the guard and in the service', async () => {
      const u = await unit();
      const id = await waiting(u);

      const byGuard = await h.completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'x' }, h.it1).expect(403);
      expect(h.codeOf(byGuard)).toBe('AUTHORIZATION.FORBIDDEN');
      const service = h.ctx.app.get(FinanceReviewService, { strict: false });
      await expect(
        service.complete(h.principal(h.it1, ['IT_ADMIN']), id, { outcome: 'RETURN_TO_HEAD', reason: 'x' }),
      ).rejects.toBeInstanceOf(SpendNotFinanceError);
      expect(await reviews(id)).toHaveLength(1);
    });

    it('refuses Finance when the request is Finance’s own or is for Finance: nobody independent reviews it', async () => {
      const u = await unit();
      const id = await waiting(u);
      await h.ctx.sql.query(`UPDATE access_requests SET requester_employee_id = $2 WHERE id = $1`, [
        id,
        h.finance.employeeId,
      ]);

      const refused = await h.completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'x' }).expect(403);

      expect(h.codeOf(refused)).toBe('SPEND.OWN_REQUEST');
      expect(await reviews(id)).toHaveLength(1);
    });

    it('answers a request that does not wait and has no review open with REVIEW_NOT_OPEN, one that does not exist with 404, and a body with no reason with 422', async () => {
      const u = await unit();
      const queued = await h.paidRequest(u, plan, { amount: 5 * M });
      const waitingId = await waiting(u);

      const notOpen = await h.completeReview(queued, { outcome: 'RETURN_TO_HEAD', reason: 'x' }).expect(409);
      const missing = await h
        .completeReview('0b8f3f0e-6d83-4f0f-9a47-7a1f0e9c1d11', { outcome: 'RETURN_TO_HEAD', reason: 'x' })
        .expect(404);
      const invalid = await h.completeReview(waitingId, { outcome: 'RETURN_TO_HEAD' }).expect(422);

      expect([h.codeOf(notOpen), h.codeOf(missing), h.codeOf(invalid)]).toEqual([
        'SPEND.REVIEW_NOT_OPEN',
        'ACCESS_REQUEST.NOT_FOUND',
        'VALIDATION_ERROR',
      ]);
    });
  });

  describe('a budget to be made, and every request that waits for a version of the year (F33)', () => {
    it('is chosen for a year with too little when somebody heads the department, and refused with nobody, even when a version is current', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const covered = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.route(covered, u.head.account);

      await h.completeReview(covered, { outcome: 'NEEDS_BUDGET', reason: 'A revision will cover it' }).expect(200);

      expect(await h.state(covered)).toBe('AWAITING_BUDGET');

      const headless = await unit();
      await h.budgetFor(headless, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const noHead = await h.paidRequest(headless, plan, { amount: 45 * M });
      await h.route(noHead, headless.head.account);
      await h.withoutHead(headless.department);

      const refused = await h.completeReview(noHead, { outcome: 'NEEDS_BUDGET', reason: 'A revision' }).expect(409);

      expect(h.codeOf(refused)).toBe('SPEND.NO_HEAD_TO_PROPOSE');
    });

    it('is refused for a year that is only of high value', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, percent: 10 });
      const id = await h.paidRequest(u, plan, { amount: 30 * M });
      await h.route(id, u.head.account);

      const refused = await h.completeReview(id, { outcome: 'NEEDS_BUDGET', reason: 'Nothing to make' }).expect(409);

      expect(h.codeOf(refused)).toBe('SPEND.NO_BUDGET_TO_MAKE');
    });

    it('checks again a request that waits for a revision, when the revision of the year is approved, by what Finance recorded and not by the code of the check', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const id = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.route(id, u.head.account);
      await h.completeReview(id, { outcome: 'NEEDS_BUDGET', reason: 'A revision will cover it' }).expect(200);
      const revision = h.dataOf<{ version: { id: string } }>(
        await h
          .createRevision({
            costCenterId: u.department.unitId,
            year: h.year,
            base: h.money(200 * M),
            reserve: h.money(0),
            reason: 'Growth of the team',
          })
          .expect(201),
      ).version;
      await h.sendVersion(revision.id).expect(200);

      await h.decideVersion(revision.id, { decision: 'APPROVE' }, h.deciderOf()).expect(200);

      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect((await checks(id)).map((check) => [check.number, check.trigger, check.route])).toEqual([
        [1, 'SUBMISSION', 'FINANCE_REVIEW'],
        [2, 'BUDGET_VERSION_APPROVED', 'SPEND_APPROVAL'],
      ]);
    });
  });

  describe('the order of the calls that meet at the row of the request (F65, deterministic by waitForLockWaiters)', () => {
    /** Holds the row of the request in another connection, lets the calls queue one by one in the order given, then releases it. */
    const meet = async (id: string, calls: Array<() => Promise<Response>>): Promise<Response[]> => {
      const holder = await h.openClient();
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM access_requests WHERE id = $1 FOR UPDATE', [id]);
      const queued: Array<Promise<Response>> = [];
      try {
        for (const [index, call] of calls.entries()) {
          queued.push(call());
          await waitForLockWaiters(h.ctx.sql, index + 1);
        }
      } finally {
        await holder.query('COMMIT');
        await holder.end();
      }

      return Promise.all(queued);
    };

    it('lets one of two Finance calls at once end it and answers the other REVIEW_NOT_OPEN, with one record', async () => {
      const u = await unit();
      const id = await waiting(u);
      const call = () => h.completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'Carry it' }).then((r) => r);

      const [first, second] = await meet(id, [call, call]);

      expect([first.status, second.status]).toEqual([200, 409]);
      expect(h.codeOf(second)).toBe('SPEND.REVIEW_NOT_OPEN');
      expect(await reviews(id)).toHaveLength(2);
    });

    it('checks it again for the approved version first, and then answers Finance that no review is open (Finance ↔ approval of the version)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const version = await sentVersion(u);
      const decide = () => h.decideVersion(version.id, { decision: 'APPROVE' }, h.boss.account).then((r) => r);
      const finance = () => h.completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'Carry it' }).then((r) => r);

      const [decided, answered] = await meet(id, [decide, finance]);

      expect(decided.status).toBe(200);
      expect(answered.status).toBe(409);
      expect(h.codeOf(answered)).toBe('SPEND.REVIEW_NOT_OPEN');
      // Not a request that was checked again and also has a new review.
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await reviews(id)).toHaveLength(1);
    });

    it('ends the request as withdrawn first, and then answers Finance that no review is open (Finance ↔ withdrawal)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const withdraw = () => h.withdrawRequest(id, {}, u.member.account).then((r) => r);
      const finance = () => h.completeReview(id, { outcome: 'RETURN_TO_HEAD', reason: 'Carry it' }).then((r) => r);

      const [withdrawn, answered] = await meet(id, [withdraw, finance]);

      expect(withdrawn.status).toBe(200);
      expect(answered.status).toBe(409);
      expect(h.codeOf(answered)).toBe('SPEND.REVIEW_NOT_OPEN');
      expect(await h.state(id)).toBe('WITHDRAWN');
      expect(await reviews(id)).toHaveLength(1);
    });
  });
});
