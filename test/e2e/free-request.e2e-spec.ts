import request from 'supertest';
import type { TaskWire } from '../support/provisioning-harness';
import { type AccessRequestWire, type Department, type Person, RequestHarness } from '../support/request-harness';

const h = new RequestHarness();

/**
 * E2E smoke: an internal tool with no fee goes from the approval of the head straight to the IT Admin, with no spend step, and is
 * granted. Real HTTP and PostgreSQL.
 */
describe('an internal request with no fee, straight to its grant (e2e)', () => {
  let design: Department;
  let head: Person;
  let member: Person;
  let planId: string;
  let requestId: string;
  let task: TaskWire;

  const requestOf = async (id: string) =>
    h.dataOf<{ request: AccessRequestWire }>(await h.fetch(id, member.account).expect(200)).request;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    head = await h.staff(design, 'DES-H1');
    await h.makeHead(design, head);
    member = await h.staff(design, 'DES-E1');
    // An internal application (K5): no vendor, no subscription, no price.
    planId = await h.plan('K5');
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  it('the employee asks for the internal tool: no price, no spend step, and the head holds the need step', async () => {
    const sent = await h.sent(member, planId);
    requestId = sent.id;

    expect(sent).toMatchObject({
      branch: 'INTERNAL_FREE',
      state: 'PENDING',
      pricing: { status: 'NOT_APPLICABLE', amount: null },
      policy: { hasSpendStep: false },
      needStep: { state: 'PENDING', assignee: { employeeId: head.employeeId } },
    });
  });

  it('the head approves: the request goes straight to the IT Admin', async () => {
    await h.decide(requestId, { decision: 'APPROVE' }, head.account).expect(200);

    expect((await requestOf(requestId)).state).toBe('AWAITING_EXECUTION');
    const steps = await h.ctx.sql.query<{ kind: string }>(
      `SELECT kind::text AS kind FROM access_request_steps WHERE request_id = $1`,
      [requestId],
    );
    expect(steps.rows).toEqual([{ kind: 'NEED' }]);
    const waiting = h.dataOf<{ items: { requestId: string }[] }>(
      await request(h.server()).get('/api/v1/grant-queue').query({ pageSize: 100 }).set(h.as(h.it1)).expect(200),
    );
    expect(waiting.items.map((item) => item.requestId)).toContain(requestId);
  });

  it('the IT Admin grants it, takes the task and completes it with evidence: the seat exists and the request is completed', async () => {
    task = h.dataOf<{ task: TaskWire }>(await h.grant({ requestId }).expect(200)).task;
    expect(task).toMatchObject({ kind: 'GRANT', status: 'QUEUED', subscriptionId: null });

    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Added to the portal by IT1' }).expect(200);

    expect((await requestOf(requestId)).state).toBe('COMPLETED');
    expect(await h.assignmentsOf({ employeeId: member.employeeId })).toEqual([
      expect.objectContaining({ id: task.assignmentId, source: 'REQUEST', planId, subscriptionId: null }),
    ]);
    const events = await h.auditOf('ACCESS_REQUEST', requestId);
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining(['ACCESS_REQUEST.SUBMITTED', 'ACCESS_REQUEST.GRANT_COMPLETED']),
    );
  });
});
