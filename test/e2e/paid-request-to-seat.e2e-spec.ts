import request from 'supertest';
import type { TaskWire } from '../support/provisioning-harness';
import type { AccessRequestWire } from '../support/request-harness';
import type { Unit } from '../support/spend-harness';
import { StatusHarness, type NoticeWire } from '../support/status-harness';

const h = new StatusHarness();
const M = 1_000_000;

/**
 * E2E smoke of D-1: an employee finds a paid plan in the catalog of software they may request, previews it and asks for it, the head approves the need and sends it on as spend, the
 * spending approver approves the batch, the IT Admin grants the seat, and the worker's pass tells the employee. Real HTTP and
 * PostgreSQL; the worker's projection is run once by hand.
 */
describe('a paid request from the employee to the seat (e2e, D-1)', () => {
  let unit: Unit;
  let subscriptionId: string;
  let planId: string;
  let requestId: string;
  let batchId: string;
  let task: TaskWire;

  const requestOf = async (id: string) =>
    h.dataOf<{ request: AccessRequestWire }>(await h.fetch(id, unit.member.account).expect(200)).request;

  beforeAll(async () => {
    await h.start();
    // The spending approver, named by the Super Admin: nobody takes their place (QĐ-93c).
    await h.withApprover();
    // A plan of the catalog at 1 000 000 VND per seat per month; the department of the request owns a subscription of it.
    subscriptionId = await h.subscription(10);
    planId = await h.planOf(subscriptionId);
    unit = await h.departmentWithHead('P-DES');
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  it('the employee finds the plan in the catalog of software they may request, and previews it', async () => {
    const as = h.as(unit.member.account);
    const plans = h.dataOf<{ items: { id: string; price: { status: string }; canSubmit: boolean }[] }>(
      await request(h.server()).get('/api/v1/requestable-plans?pageSize=100').set(as).expect(200),
    ).items;
    const picked = plans.find((plan) => plan.id === planId);
    expect(picked).toMatchObject({ price: { status: 'PRICED' }, canSubmit: true });
    const detail = h.dataOf<{ id: string; application: { id: string } }>(
      await request(h.server()).get(`/api/v1/requestable-plans/${planId}`).set(as).expect(200),
    );
    await request(h.server()).get(`/api/v1/requestable-applications/${detail.application.id}`).set(as).expect(200);

    const preview = await h.previewed(unit.member, detail.id, { termMonths: 1 });

    expect(preview).toMatchObject({ branch: 'PAID_IN_CATALOG', canSubmit: true, pricing: { status: 'PRICED' } });
  });

  it('the employee sends the request, priced by the subscription of the department, and the head holds the need step', async () => {
    const sent = await h.sent(unit.member, planId, { termMonths: 1 });
    requestId = sent.id;

    expect(sent).toMatchObject({
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      pricing: { status: 'PRICED', amount: { amount: String(M), currency: 'VND' } },
      policy: { hasSpendStep: true },
      needStep: { state: 'PENDING', assignee: { employeeId: unit.head.employeeId } },
    });
  });

  it('the head approves the need: the request waits to be sent on as spend', async () => {
    await h.decide(requestId, { decision: 'APPROVE' }, unit.head.account).expect(200);

    expect(await requestOf(requestId)).toMatchObject({
      state: 'AWAITING_SPEND_SUBMISSION',
      needDecision: { decision: 'APPROVED', decidedBy: { employeeId: unit.head.employeeId } },
    });
  });

  it('with a budget in force for the year, the head sends it on in a batch and the check routes it to the approver', async () => {
    const year = (await requestOf(requestId)).budgetYear ?? h.year;
    await h.budgetFor(unit, { total: 100 * M, year });

    const batch = h.dataOf<{ batch: { id: string } }>(await h.sendOn([requestId], unit.head.account).expect(201)).batch;
    batchId = batch.id;

    expect((await requestOf(requestId)).state).toBe('AWAITING_SPEND_DECISION');
    const queue = h.dataOf<{ items: { requestId: string; primaryCode: string; batchId: string | null }[] }>(
      await h.approvals(h.boss.account, { pageSize: 100 }).expect(200),
    );
    expect(queue.items).toContainEqual(expect.objectContaining({ requestId, primaryCode: 'BUDGET_OK', batchId }));
  });

  it('the spending approver approves the batch: money is held for it and it waits for the IT Admin', async () => {
    const results = h.dataOf<{ results: { requestId: string; outcome: string }[] }>(
      await h.decideBatch(batchId, { decision: 'APPROVE', requestIds: [requestId] }, h.boss.account).expect(200),
    ).results;

    expect(results).toEqual([expect.objectContaining({ requestId, outcome: 'APPROVED' })]);
    expect((await requestOf(requestId)).state).toBe('AWAITING_EXECUTION');
    const held = await h.ctx.sql.query<{ state: string; cost_center_id: string }>(
      `SELECT state::text AS state, cost_center_id FROM budget_commitments WHERE request_id = $1`,
      [requestId],
    );
    expect(held.rows).toEqual([{ state: 'HELD', cost_center_id: unit.department.unitId }]);
    const waiting = h.dataOf<{ items: { requestId: string }[] }>(
      await h.grantQueue(h.it1, { pageSize: 100 }).expect(200),
    );
    expect(waiting.items.map((item) => item.requestId)).toContain(requestId);
  });

  it('the IT Admin grants, takes and completes the task: the employee holds the seat and the request is completed', async () => {
    task = h.dataOf<{ task: TaskWire }>(await h.grant({ requestId, subscriptionId }).expect(200)).task;
    expect(task).toMatchObject({ kind: 'GRANT', status: 'QUEUED', requestId });
    expect((await requestOf(requestId)).state).toBe('EXECUTING');

    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Invited by work email' }).expect(200);

    expect((await requestOf(requestId)).state).toBe('COMPLETED');
    const seats = await h.assignmentsOf({ employeeId: unit.member.employeeId });
    expect(seats).toEqual([
      expect.objectContaining({ id: task.assignmentId, source: 'REQUEST', kind: 'PERSONAL', planId }),
    ]);
    const ownSubscription = h.owned.subscriptionFor(subscriptionId, unit.department.id);
    expect(seats[0].subscriptionId).toBe(ownSubscription);
    const usage = h.dataOf<{ occupied: number }>(await h.seatUsage(ownSubscription).expect(200));
    expect(usage.occupied).toBe(1);
  });

  it("the worker's pass tells the employee, who finds the grant in the inbox", async () => {
    await h.project();

    const inbox = h.dataOf<{ items: NoticeWire[] }>(await h.inbox(unit.member.account, { pageSize: 50 }).expect(200));
    const codes = inbox.items.filter((notice) => notice.subject?.id === requestId).map((notice) => notice.code);
    expect(codes).toEqual(expect.arrayContaining(['REQUEST_SUBMITTED', 'REQUEST_SPEND_APPROVED', 'REQUEST_GRANTED']));
  });
});
