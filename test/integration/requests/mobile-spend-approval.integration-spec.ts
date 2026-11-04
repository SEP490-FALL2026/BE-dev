import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import type { AccessRequestWire } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';
import { StatusHarness } from '../../support/status-harness';

const h = new StatusHarness();
const M = 1_000_000;
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (iOS 19)', 'X-Client': 'mobile' } as const;
const WEB = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)', 'X-Client': 'web' } as const;
type Label = Record<string, string>;

interface QueueItem {
  requestId: string;
  stepId: string;
  primaryCode: string | null;
  samePersonAsSpend: boolean;
}
interface YearWire {
  code: string | null;
  budget: { amount: string } | null;
  held: { amount: string } | null;
  spent: { amount: string } | null;
  remaining: { amount: string } | null;
  pending: { amount: string } | null;
}

/**
 * The spending approver decides on the phone (US-16-03): the spend step on a snapshot that is only read, and the need step of a
 * request a head sent for themselves, as two decisions; a step that waits for Finance, overrides, conflicts and screens that went
 * stale. Routes of the web with a mobile label; real HTTP and PostgreSQL. One queue of both kinds of step does not exist yet
 * (B-02/B-10): `GET /spend-approvals` lists spend steps only, which a test below records.
 */
describe('the spending approver decides on the phone (US-16-03, integration)', () => {
  let plan: string;
  let counter = 0;

  const headers = (account: ApiAccount, label: Label = MOBILE) => ({ ...h.as(account), ...label });
  const get = (path: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(h.server()).get(`/api/v1${path}`).query(query).set(headers(account));
  const post = (path: string, account: ApiAccount, body: object, label?: Label) =>
    request(h.server()).post(`/api/v1${path}`).set(headers(account, label)).send(body);
  const spend = (id: string, body: object, account: ApiAccount = h.boss.account, label?: Label) =>
    post(`/access-requests/${id}/spend-approval`, account, body, label);
  const queue = async (account: ApiAccount = h.boss.account) =>
    h.dataOf<{ items: QueueItem[] }>(await get('/spend-approvals', account, { pageSize: 100 }).expect(200)).items;
  const years = async (id: string) =>
    h.dataOf<{ items: YearWire[] }>(await get(`/access-requests/${id}/budget-check/years`, h.boss.account).expect(200))
      .items;
  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-C${counter}`);
  };
  /** The example of the story: 100 million, 40 spent, 20 held, so 40 left. */
  const example = async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });

    return u;
  };
  const records = async (id: string) =>
    (
      await h.ctx.sql.query<{
        kind: string;
        decision: string;
        decided_by_employee_id: string;
        decider_role: string;
        reason: string | null;
      }>(
        `SELECT s.kind::text, r.decision::text, r.decided_by_employee_id, r.decider_role::text, r.reason
           FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id WHERE r.request_id = $1 ORDER BY r.decided_at`,
        [id],
      )
    ).rows;
  const commitments = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state::text FROM budget_commitments WHERE request_id = $1`, [id]))
      .rows;
  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    // The tax of the vendor is deducted, so what a request costs the company is its price before tax, as in the story.
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the spend step on a snapshot that is only read (AC-1, AC-2, AC-9)', () => {
    it('shows the approver the confirmed need, the cost and the figures of the budget as the check read them, with nothing to edit (AC-1)', async () => {
      const u = await example();
      const r1 = await h.waitingForApprover(u, plan, { amount: 10 * M });
      await h.waitingForApprover(u, plan, { amount: 15 * M });

      const item = (await queue()).find((row) => row.requestId === r1);
      const detail = h.dataOf<{ spendApproval: Record<string, unknown> }>(
        await get(`/access-requests/${r1}/spend-approval`, h.boss.account).expect(200),
      ).spendApproval;
      const check = h.dataOf<{ budgetCheck: { ranAt: string; route: string } }>(
        await get(`/access-requests/${r1}/budget-check`, h.boss.account).expect(200),
      ).budgetCheck;

      expect(item).toMatchObject({ primaryCode: 'BUDGET_OK', samePersonAsSpend: false });
      expect(detail).toMatchObject({
        step: { state: 'PENDING', assignee: { employeeId: h.boss.employeeId } },
        need: { decidedBy: { employeeId: u.head.employeeId } },
        request: { businessReason: 'Design the new brand' },
      });
      expect(check.route).toBe('SPEND_APPROVAL');
      expect(Number.isNaN(Date.parse(check.ranAt))).toBe(false);
      expect((await years(r1))[0]).toMatchObject({
        code: 'BUDGET_OK',
        budget: { amount: String(100 * M) },
        spent: { amount: String(40 * M) },
        held: { amount: String(20 * M) },
        remaining: { amount: String(40 * M) },
        pending: { amount: String(15 * M) },
      });
      // There is no field of the decision for a figure: a snapshot cannot be changed from the phone.
      const edited = await spend(r1, { decision: 'APPROVE', remaining: { amount: '1', currency: 'VND' } }).expect(422);
      expect(h.codeOf(edited)).toBe('VALIDATION_ERROR');
    });

    it('approves on the phone: one record with the snapshot, one commitment held, the employee told (AC-2, AC-9)', async () => {
      const u = await example();
      const r1 = await h.waitingForApprover(u, plan, { amount: 10 * M });

      const approved = await spend(r1, { decision: 'APPROVE' }).expect(200);
      await h.project();

      expect(h.dataOf<{ spendApproval: Record<string, unknown> }>(approved).spendApproval).toMatchObject({
        request: { state: 'AWAITING_EXECUTION' },
        decision: { decision: 'APPROVED', decidedBy: { employeeId: h.boss.employeeId }, bySubstitute: false },
      });
      expect(await records(r1)).toEqual([
        expect.objectContaining({ kind: 'NEED', decider_role: 'MANAGER' }),
        expect.objectContaining({ kind: 'SPEND_APPROVAL', decision: 'APPROVED', decider_role: 'SPENDING_APPROVER' }),
      ]);
      const kept = await h.ctx.sql.query<{ check_id: string | null }>(
        `SELECT check_id FROM spend_decisions WHERE request_id = $1`,
        [r1],
      );
      expect(kept.rows).toHaveLength(1);
      expect(kept.rows[0].check_id).not.toBeNull();
      expect(await commitments(r1)).toEqual([{ state: 'HELD' }]);
      expect(await h.codesFor(u.member.employeeId, r1)).toContain('REQUEST_SPEND_APPROVED');
      await expect(
        h.ctx.sql.query(`UPDATE spend_decisions SET override_reason = 'changed' WHERE request_id = $1`, [r1]),
      ).rejects.toThrow();
    });

    it('refuses only with a reason: the request ends refused, holds nothing and the employee reads why (AC-2)', async () => {
      const u = await example();
      const r1 = await h.waitingForApprover(u, plan, { amount: 10 * M });

      const missing = await spend(r1, { decision: 'REJECT' }).expect(422);
      expect(h.codeOf(missing)).toBe('VALIDATION_ERROR');
      await spend(r1, { decision: 'REJECT', reason: 'Not this quarter' }).expect(200);
      await h.project();

      expect(await h.state(r1)).toBe('REJECTED');
      expect(await commitments(r1)).toEqual([]);
      const told = (await h.noticesOf(u.member.employeeId, 'REQUEST_REJECTED')).filter((row) => row.subject_id === r1);
      expect(told.map((row) => row.params)).toEqual([
        expect.objectContaining({ by: 'SPEND', reason: 'Not this quarter' }),
      ]);
    });

    it('decides a step while the question to Finance has no answer yet (AC-2)', async () => {
      const u = await example();
      const r1 = await h.waitingForApprover(u, plan, { amount: 10 * M });
      await h.askFinance(r1, { question: 'Is the renewal of next year planned?' }, h.boss.account).expect(201);

      await spend(r1, { decision: 'APPROVE' }).expect(200);

      expect(await commitments(r1)).toEqual([{ state: 'HELD' }]);
    });
  });

  describe('a request that waits for Finance, an override, no budget (AC-2)', () => {
    it('has no spend step on the phone while Finance reviews it; afterwards it is approved only by an override with its reason', async () => {
      const u = await example();
      const big = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.sendOn([big], u.head.account).expect(201);
      expect(await h.state(big)).toBe('AWAITING_FINANCE_REVIEW');

      expect((await queue()).map((row) => row.requestId)).not.toContain(big);
      await get(`/access-requests/${big}/spend-approval`, h.boss.account).expect(404);
      const early = await spend(big, { decision: 'APPROVE' }).expect(409);
      expect(h.codeOf(early)).toBe('SPEND.NO_SPEND_STEP');

      await h
        .completeReview(big, { outcome: 'ASSESSED', opinion: 'Over by 5 million', direction: 'RECOMMEND_OVERRIDE' })
        .expect(200);
      const bare = await spend(big, { decision: 'APPROVE' }).expect(422);
      const blank = await spend(big, { decision: 'APPROVE', override: { reason: ' ', years: [h.year] } }).expect(422);
      await spend(big, { decision: 'APPROVE', override: { reason: 'Revision next month', years: [h.year] } }).expect(
        200,
      );

      expect([h.codeOf(bare), h.codeOf(blank)]).toEqual(['SPEND.OVERRIDE_REQUIRED', 'VALIDATION_ERROR']);
      expect(h.detailsOf(bare)).toMatchObject({ years: [h.year] });
      expect(await commitments(big)).toEqual([{ state: 'HELD' }]);
    });

    it('says a Cost Center has no budget, not that it has nothing left (AC-2)', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 30 * M });
      await h.sendOn([id], u.head.account).expect(201);
      await h
        .completeReview(id, { outcome: 'ASSESSED', opinion: 'No budget yet', direction: 'RECOMMEND_OVERRIDE' })
        .expect(200);

      expect((await years(id))[0]).toMatchObject({ code: 'NO_ACTIVE_BUDGET', budget: null, remaining: null });
    });
  });

  describe('who decides (AC-3, AC-4, AC-6)', () => {
    it('refuses Finance, the head, the IT Admin and the employee, and the request does not move (AC-3)', async () => {
      const u = await example();
      const r1 = await h.waitingForApprover(u, plan, { amount: 10 * M });

      for (const account of [h.finance, u.head.account, h.it1]) {
        expect(h.codeOf(await spend(r1, { decision: 'APPROVE' }, account).expect(403))).toBe('SPEND.NOT_THE_ASSIGNEE');
      }
      expect(h.codeOf(await spend(r1, { decision: 'APPROVE' }, u.member.account).expect(403))).toBe(
        'SPEND.OWN_REQUEST',
      );
      expect(await h.state(r1)).toBe('AWAITING_SPEND_DECISION');
      expect(await records(r1)).toHaveLength(1);
    });

    it('decides the need step of the request a head sent for themselves, then its spend step: two records, flagged as one person (AC-4)', async () => {
      const u = await example();
      const r9 = await h.sent(u.head, plan, { termMonths: 1 });
      expect(r9.needStep).toMatchObject({ routingRow: 2, assignee: { employeeId: h.boss.employeeId } });
      // The list of the phone has spend steps only: the need step the approver holds is not in it (B-02).
      expect((await queue()).map((row) => row.requestId)).not.toContain(r9.id);

      const unexplained = await post(`/access-requests/${r9.id}/need-decision`, h.boss.account, { decision: 'REJECT' });
      expect(unexplained.status).toBe(422);
      const need = await post(`/access-requests/${r9.id}/need-decision`, h.boss.account, {
        decision: 'APPROVE',
      }).expect(200);
      expect(h.dataOf<{ request: AccessRequestWire }>(need).request).toMatchObject({
        state: 'AWAITING_SPEND_DECISION',
        needDecision: { deciderRole: 'SPENDING_APPROVER', decidedBy: { employeeId: h.boss.employeeId } },
      });
      expect((await queue()).find((row) => row.requestId === r9.id)).toMatchObject({ samePersonAsSpend: true });

      await spend(r9.id, { decision: 'APPROVE' }).expect(200);

      expect(await records(r9.id)).toEqual([
        expect.objectContaining({
          kind: 'NEED',
          decider_role: 'SPENDING_APPROVER',
          decided_by_employee_id: h.boss.employeeId,
        }),
        expect.objectContaining({ kind: 'SPEND_APPROVAL', decider_role: 'SPENDING_APPROVER' }),
      ]);
      expect((await h.steps(r9.id, 'NEED'))[0].same_person_as_spend).toBe(true);
      expect((await h.steps(r9.id, 'SPEND_APPROVAL'))[0].same_person_as_spend).toBe(true);
      expect(await commitments(r9.id)).toEqual([{ state: 'HELD' }]);
    });

    it('gives the approver no decision on a request they are a party of, and no substitute decides it: the step waits (AC-6, data of before QĐ-93)', async () => {
      const u = await example();
      const id = await h.paidRequest(u, plan, { amount: 10 * M });
      // The approver can no longer send or be given a request (D-S21): this is one of before, with the approver put in by SQL.
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        id,
        h.boss.employeeId,
      ]);
      await h.sendOn([id], u.head.account).expect(201);
      expect((await h.steps(id, 'SPEND_APPROVAL'))[0]).toMatchObject({
        state: 'WAITING',
        assignee_employee_id: null,
        waiting_reason: 'SPENDING_APPROVER_IS_PARTY',
      });

      expect((await queue()).map((row) => row.requestId)).not.toContain(id);
      expect((await queue(h.bystander.account)).map((row) => row.requestId)).not.toContain(id);
      await get(`/access-requests/${id}/spend-approval`, h.boss.account).expect(404);
      expect(h.codeOf(await spend(id, { decision: 'APPROVE' }).expect(403))).toBe('SPEND.OWN_REQUEST');
      expect(h.codeOf(await spend(id, { decision: 'APPROVE' }, h.bystander.account, WEB).expect(403))).toBe(
        'SPEND.NOT_THE_ASSIGNEE',
      );
      expect(await records(id)).toEqual([expect.objectContaining({ kind: 'NEED' })]);
    });
  });

  describe('a screen that went stale (AC-7)', () => {
    it('refuses the phone after the approver decided on the web: no second record, no second commitment', async () => {
      const u = await example();
      const r1 = await h.waitingForApprover(u, plan, { amount: 10 * M });
      await get(`/access-requests/${r1}/spend-approval`, h.boss.account).expect(200);
      await spend(r1, { decision: 'APPROVE' }, h.boss.account, WEB).expect(200);

      const approve = await spend(r1, { decision: 'APPROVE' }).expect(409);
      const reject = await spend(r1, { decision: 'REJECT', reason: 'Too late' }).expect(409);

      expect([h.codeOf(approve), h.codeOf(reject)]).toEqual(['SPEND.NO_SPEND_STEP', 'SPEND.NO_SPEND_STEP']);
      expect((await records(r1)).filter((row) => row.kind === 'SPEND_APPROVAL')).toHaveLength(1);
      expect(await commitments(r1)).toEqual([{ state: 'HELD' }]);
    });

    it('refuses the phone after the employee withdrew the request on the web, and nothing is held', async () => {
      const u = await example();
      const r2 = await h.waitingForApprover(u, plan, { amount: 10 * M });
      await post(`/access-requests/${r2}/withdraw`, u.member.account, {}, WEB).expect(200);

      const refused = await spend(r2, { decision: 'APPROVE' }).expect(409);

      expect(h.codeOf(refused)).toBe('SPEND.NO_SPEND_STEP');
      expect(await h.state(r2)).toBe('WITHDRAWN');
      expect((await records(r2)).filter((row) => row.kind === 'SPEND_APPROVAL')).toEqual([]);
      expect(await commitments(r2)).toEqual([]);
    });

    it('lets one of two approvals sent at once from the web and the phone through: one record, one commitment', async () => {
      const u = await example();
      const r1 = await h.waitingForApprover(u, plan, { amount: 10 * M });

      const answers = await h.queuedOnRequest(r1, [
        () => spend(r1, { decision: 'APPROVE' }, h.boss.account, WEB),
        () => spend(r1, { decision: 'APPROVE' }, h.boss.account, MOBILE),
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
      expect((await records(r1)).filter((row) => row.kind === 'SPEND_APPROVAL')).toHaveLength(1);
      expect(await commitments(r1)).toEqual([{ state: 'HELD' }]);
    });

    it('refuses the former approver once the Super Admin named another, whose queue now has the step (last: it changes the approver)', async () => {
      const u = await example();
      const r1 = await h.waitingForApprover(u, plan, { amount: 10 * M });
      const next = await h.staff(await h.departmentWithUnit('P-NEXT'), 'NEXT-C2');

      await h.setRole('SPENDING_APPROVER', next);
      const refused = await spend(r1, { decision: 'APPROVE' }).expect(403);

      expect(h.codeOf(refused)).toBe('SPEND.NOT_THE_ASSIGNEE');
      await get(`/access-requests/${r1}/spend-approval`, h.boss.account).expect(404);
      expect((await records(r1)).filter((row) => row.kind === 'SPEND_APPROVAL')).toEqual([]);
      expect((await queue(next.account)).map((row) => row.requestId)).toContain(r1);
      await spend(r1, { decision: 'APPROVE' }, next.account).expect(200);
      expect(await commitments(r1)).toEqual([{ state: 'HELD' }]);
    });
  });
});
