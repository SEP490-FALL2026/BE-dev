import request from 'supertest';
import { addDays } from '../../src/core/business-date';
import { assignHead } from '../support/builders/organization.builder';
import type { AccessRequestWire, Department, Person } from '../support/request-harness';
import { StatusHarness } from '../support/status-harness';

const w = new StatusHarness();

/** A headless department submits directly to spend; a missing budget preserves the request for its sender to resubmit. */
describe('BR-MF1-02 a headless department follows the one-step journey (e2e)', () => {
  let department: Department;
  let member: Person;
  let newHead: Person;
  let planId: string;
  let requestId: string;
  const requestOf = async () =>
    w.dataOf<{ request: AccessRequestWire }>(await w.fetch(requestId, member.account).expect(200)).request;

  beforeAll(async () => {
    await w.start();
    await w.withApprover();
    planId = await w.planOf(await w.subscription(10));
    department = await w.departmentWithUnit('P-NHD');
    member = await w.staff(department, 'NHD-E');
    newHead = await w.staff(department, 'NHD-H');
  }, 180000);

  afterAll(async () => {
    await w.stop();
  });

  it('BR-MF1-02 saves a blocked request without a need approver or a controlled wait for a head', async () => {
    const sent = await w.sent(member, planId, { termMonths: 1 });
    requestId = sent.id;
    await w.sweep();
    await w.project();
    expect(sent).toMatchObject({
      state: 'AWAITING_REQUESTER_REVISION',
      routing: { mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' },
      needStep: { state: 'NOT_REQUIRED', assignee: null, routingRow: 4 },
    });
    const kept = await w.ctx.sql.query(`SELECT id FROM approval_records WHERE request_id = $1`, [requestId]);
    expect(kept.rows).toEqual([]);
    for (const employeeId of [w.boss.employeeId, w.it1.employeeId, newHead.employeeId]) {
      expect(
        (await w.noticesOf(employeeId, 'CONTROLLED_WAIT_ALERT')).filter((row) => row.subject_id === requestId),
      ).toEqual([]);
    }
  });

  it('BR-MF1-02 a new head and an approved budget let the sender resubmit while routing stays one-step', async () => {
    await w.makeHead(department, newHead);
    await w.budgetFor({ department, head: newHead, member }, { total: 100_000_000, year: w.year });
    await request(w.server())
      .post(`/api/v1/access-requests/${requestId}/resubmission`)
      .set('Authorization', `Bearer ${member.account.accessToken}`)
      .expect(200);
    expect(await requestOf()).toMatchObject({
      state: 'AWAITING_SPEND_DECISION',
      routing: { mode: 'ONE_STEP' },
      needStep: { state: 'NOT_REQUIRED' },
    });
    const queue = w.dataOf<{ items: { requestId: string; batchId: string | null }[] }>(
      await w.approvals(w.boss.account, { pageSize: 100 }).expect(200),
    );
    expect(queue.items).toContainEqual(expect.objectContaining({ requestId, batchId: null }));
  });

  it('BR-MF1-02 only the spending approver decides, with exactly one approval record', async () => {
    await w.decideSpend(requestId, { decision: 'APPROVE' }, newHead.account).expect(404);
    expect((await requestOf()).state).toBe('AWAITING_SPEND_DECISION');
    await w.decideSpend(requestId, { decision: 'APPROVE' }, w.boss.account).expect(200);
    expect((await requestOf()).state).toBe('AWAITING_EXECUTION');
    const kept = await w.ctx.sql.query<{ kind: string; decider_role: string; decided_by: string }>(
      `SELECT s.kind::text, r.decider_role::text, r.decided_by_employee_id::text AS decided_by
         FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id
        WHERE r.request_id = $1 ORDER BY r.decided_at`,
      [requestId],
    );
    expect(kept.rows).toEqual([
      { kind: 'SPEND_APPROVAL', decider_role: 'SPENDING_APPROVER', decided_by: w.boss.employeeId },
    ]);
  });

  it('BR-MF1-02 M-15 a future successor does not add a need step to a newly sent request', async () => {
    const gap = await w.departmentWithUnit('P-GAP');
    const sender = await w.staff(gap, 'GAP-E');
    const successor = await w.staff(gap, 'GAP-H');
    await assignHead(w.ctx, w.admin, gap.id, {
      employeeId: successor.employeeId,
      effectiveFrom: addDays(w.today(), 1),
    });
    expect(await w.sent(sender, planId, { termMonths: 1 })).toMatchObject({
      state: 'AWAITING_REQUESTER_REVISION',
      routing: { mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' },
      needStep: { state: 'NOT_REQUIRED', assignee: null },
    });
  });
});
