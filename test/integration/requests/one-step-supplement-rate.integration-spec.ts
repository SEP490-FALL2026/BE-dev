import request from 'supertest';
import { GroupHarness } from '../../support/group-harness';
import type { AccessRequestWire } from '../../support/request-harness';

const h = new GroupHarness();
const M = 1_000_000;
let serial = 0;

describe('BR-MF1-02 one-step reserve, supplementary files and missing rates', () => {
  let plan: string;
  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(100));
  }, 240000);
  afterAll(async () => {
    await h.stop();
  });
  const unit = () => h.departmentWithHead(`P-OSX${++serial}`);
  const resubmit = (id: string, account: Parameters<typeof h.fetch>[1]) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/resubmission`).set(h.as(account));
  const fetch = async (id: string, account: Parameters<typeof h.fetch>[1]) =>
    h.dataOf<{ request: AccessRequestWire }>(await h.fetch(id, account).expect(200)).request;

  it('BR-MF1-02 opens spend immediately when the first submission uses reserve, with no confirmation', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: M / 2, reserve: M });
    const sent = await h.sent(u.head, plan, { termMonths: 1 });
    expect(sent.state).toBe('AWAITING_SPEND_DECISION');
    expect(sent.needStep.state).toBe('NOT_REQUIRED');
    const checks = await h.ctx.sql.query(
      `SELECT outcome FROM request_budget_checks WHERE request_id=$1 ORDER BY number`,
      [sent.id],
    );
    expect(checks.rows).toEqual([{ outcome: 'USES_RESERVE' }]);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    expect(
      (await h.ctx.sql.query(`SELECT 1 FROM request_reserve_confirmations WHERE request_id=$1`, [sent.id])).rows,
    ).toEqual([]);
    expect((await h.ctx.sql.query(`SELECT 1 FROM approval_records WHERE request_id=$1`, [sent.id])).rows).toHaveLength(
      1,
    );
  });

  it('BR-MF1-02 lets the requester shorten their term through a real supplementary file and resubmit', async () => {
    const u = await unit();
    const sent = await h.sent(u.head, plan);
    expect(sent.state).toBe('AWAITING_REQUESTER_REVISION');
    await h
      .addSupplement(sent.id, { reason: 'Only need access until today', expectedEndDate: h.today() }, u.member.account)
      .expect(403);
    const response = await h
      .addSupplement(
        sent.id,
        {
          reason: 'Only need access until today',
          expectedEndDate: h.today(),
        },
        u.head.account,
      )
      .expect(201);
    const file = h.dataOf<{
      supplement: { changedBy: { employeeId: string }; expectedEndDate: { before: string | null; after: string } };
    }>(response).supplement;
    expect(file).toMatchObject({
      changedBy: { employeeId: u.head.employeeId },
      expectedEndDate: { before: null, after: h.today() },
    });
    await h.budgetFor(u, { total: 10 * M });
    await resubmit(sent.id, u.head.account).expect(200);
    expect(await fetch(sent.id, u.head.account)).toMatchObject({
      state: 'AWAITING_SPEND_DECISION',
      expectedEndDate: h.today(),
    });
  });

  it('BR-MF1-02 lets the requester of a group the earlier rule turned into one-step remove a person through the supplementary API', async () => {
    const u = await unit();
    const people = await h.colleagues(u, 3);
    const response = await h.submitGroup(h.groupBody(plan, people), people[0].account).expect(201);
    const sent = h.dataOf<{ request: AccessRequestWire }>(response).request;
    // QĐ-110i: a missing head no longer turns a group into one-step. This one stands for the data of an earlier deploy, which the sweep finishes.
    await h.markedOneStepByEarlierRule(sent.id);
    await h.sweep();
    expect((await fetch(sent.id, people[0].account)).state).toBe('AWAITING_REQUESTER_REVISION');
    const file = await h
      .addSupplement(
        sent.id,
        {
          reason: 'One colleague no longer needs the tool',
          dropEmployeeIds: [people[2].employeeId],
        },
        people[0].account,
      )
      .expect(201);
    expect(h.dataOf<{ supplement: { droppedCount: number } }>(file).supplement.droppedCount).toBe(1);
    await h.budgetFor(u, { total: 100 * M });
    await resubmit(sent.id, people[0].account).expect(200);
    expect(await fetch(sent.id, people[0].account)).toMatchObject({
      state: 'AWAITING_SPEND_DECISION',
      routing: { mode: 'ONE_STEP' },
    });
    expect(await h.lineStates(sent.id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'DROPPED']);
  });

  it('BR-MF1-02 Q-31 persists RATE_MISSING without a new check or stale overBy, then recovers after a rate is recorded', async () => {
    const u = await unit();
    const sent = await h.sent(u.head, plan, { termMonths: 1 });
    await h.setPayments(sent.id, { amount: 100_000, currency: 'USD' });
    const before = await h.ctx.sql.query(`SELECT id FROM request_budget_checks WHERE request_id=$1`, [sent.id]);
    await resubmit(sent.id, u.head.account).expect(200);
    expect(await fetch(sent.id, u.head.account)).toMatchObject({
      state: 'AWAITING_REQUESTER_REVISION',
      spend: { stage: 'RETURNED_TO_REQUESTER', blockedReasons: ['RATE_MISSING'], overBy: null },
    });
    const after = await h.ctx.sql.query(`SELECT id FROM request_budget_checks WHERE request_id=$1`, [sent.id]);
    expect(after.rows).toEqual(before.rows);
    await request(h.server())
      .post('/api/v1/exchange-rates')
      .set(h.as(h.finance))
      .send({ currency: 'USD', rateDate: h.today(), rate: '25000' })
      .expect(201);
    await h.budgetFor(u, { total: 100 * M });
    await resubmit(sent.id, u.head.account).expect(200);
    expect((await fetch(sent.id, u.head.account)).state).toBe('AWAITING_SPEND_DECISION');
  });
});
