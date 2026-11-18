import request from 'supertest';
import { SpendHarness, type Unit } from '../../support/spend-harness';
import { AccessRequestWire } from '../../support/request-harness';
const h = new SpendHarness();
const M = 1_000_000;
describe('BR-MF1-02: one-step requests over PostgreSQL', () => {
  let plan: string;
  let n = 0;
  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(100));
  }, 240000);
  afterAll(async () => h.stop());
  const unit = async (budget?: { total: number; reserve?: number }): Promise<Unit> => {
    const u = await h.departmentWithHead(`P-ONE${++n}`);
    if (budget) await h.budgetFor(u, budget);
    return u;
  };
  const fetch = async (id: string, u: Unit) =>
    h.dataOf<{ request: AccessRequestWire }>(await h.fetch(id, u.head.account).expect(200)).request;
  const resubmit = (id: string, u: Unit) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/resubmission`).set(h.as(u.head.account));
  const records = async (id: string) =>
    (
      await h.ctx.sql.query<{ decider_role: string }>(
        `SELECT decider_role FROM approval_records WHERE request_id = $1`,
        [id],
      )
    ).rows;
  it('BR-MF1-02: head own paid request has NOT_REQUIRED need and one spend decision, no batch', async () => {
    const u = await unit({ total: 1000 * M });
    const sent = await h.sent(u.head, plan, { termMonths: 1 });
    expect(sent.routing).toEqual({ mode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD' });
    expect(sent.needStep).toMatchObject({
      state: 'NOT_REQUIRED',
      assignee: null,
      slaWorkingDays: null,
      assignedAt: null,
    });
    expect(sent.state).toBe('AWAITING_SPEND_DECISION');
    expect(sent.needDecision).toBeNull();
    await expect(records(sent.id)).resolves.toEqual([]);
    const queue = h.dataOf<{ items: Array<{ requestId: string }> }>(await h.spendQueue(u.head.account).expect(200));
    expect(queue.items.some((row) => row.requestId === sent.id)).toBe(false);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    expect(await records(sent.id)).toEqual([{ decider_role: 'SPENDING_APPROVER' }]);
  });
  it('BR-MF1-02: blocked request persists; requester can withdraw it', async () => {
    const u = await unit();
    const sent = await h.sent(u.head, plan, { termMonths: 1 });
    expect(sent.state).toBe('AWAITING_REQUESTER_REVISION');
    expect(sent.spend).toMatchObject({ stage: 'RETURNED_TO_REQUESTER', blockedReasons: ['NO_APPROVED_BUDGET'] });
    await h.withdrawRequest(sent.id, {}, u.head.account).expect(200);
    expect((await fetch(sent.id, u)).state).toBe('WITHDRAWN');
  });
  it('BR-MF1-02: uses reserve immediately without confirmation, approver decides it once', async () => {
    const u = await unit({ total: 100 * M, reserve: 100 * M });
    const sent = await h.sent(u.head, plan, { termMonths: 1 });
    await h.setPayments(sent.id, { amount: 150 * M });
    // Recheck at decision uses reserve although submission fitted the base.
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    expect(await records(sent.id)).toEqual([{ decider_role: 'SPENDING_APPROVER' }]);
    expect(
      (await h.ctx.sql.query(`SELECT 1 FROM request_reserve_confirmations WHERE request_id = $1`, [sent.id])).rows,
    ).toHaveLength(0);
  });
  it('BR-MF1-02: blocked recheck commits the return, reports 409, supplementary file + resubmission succeeds', async () => {
    const u = await unit({ total: 100 * M });
    const sent = await h.sent(u.head, plan, { termMonths: 1 });
    await h.setPayments(sent.id, { amount: 150 * M });
    const blocked = await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(409);
    expect(h.codeOf(blocked)).toBe('SPEND.RECHECKED_RETURNED_TO_REQUESTER');
    expect((await fetch(sent.id, u)).state).toBe('AWAITING_REQUESTER_REVISION');
    expect(await records(sent.id)).toEqual([]);
    await h.setPayments(sent.id, { amount: 50 * M });
    const attempts = await Promise.all([resubmit(sent.id, u), resubmit(sent.id, u)]);
    expect(attempts.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect((await fetch(sent.id, u)).state).toBe('AWAITING_SPEND_DECISION');
  });
  it('BR-MF1-02 Q-31: missing price survives repeated resubmission without a budget-check row', async () => {
    const u = await unit();
    const sent = await h.sent(u.head, await h.plan('K2'));
    expect(sent.state).toBe('AWAITING_REQUESTER_REVISION');
    await resubmit(sent.id, u).expect(200);
    expect((await fetch(sent.id, u)).spend?.blockedReasons).toEqual(['PRICE_MISSING']);
    expect(
      (await h.ctx.sql.query(`SELECT 1 FROM request_budget_checks WHERE request_id = $1`, [sent.id])).rows,
    ).toHaveLength(0);
  });
  it('BR-MF1-02: no-head internal request goes to IT and records the no-need audit flag', async () => {
    const d = await h.departmentWithUnit(`P-FREE${++n}`);
    const person = await h.staff(d, `FREE${n}`);
    const sent = await h.sent(person, await h.plan('K5'));
    expect(sent.state).toBe('AWAITING_EXECUTION');
    expect(sent.routing).toEqual({ mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' });
    expect(sent.needStep.state).toBe('NOT_REQUIRED');
    expect((await h.auditEvents('ACCESS_REQUEST', sent.id)).map((event) => event.action)).toContain(
      'ACCESS_REQUEST.NO_NEED_APPROVER',
    );
  });
});
