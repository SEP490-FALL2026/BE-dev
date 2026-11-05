import type { AccessRequestWire, Department, Person } from '../support/request-harness';
import type { Unit } from '../support/spend-harness';
import { StatusHarness } from '../support/status-harness';

const M = 1_000_000;
const w = new StatusHarness();

/**
 * E2E of the journey of QĐ-93c: the department has no head, so the need step of a paid request waits under control (the Super
 * Admin alone is told) and goes to the head the moment the Super Admin names one, with its age kept; the head approves the need, sends
 * it on in a batch, and the spending approver alone decides the spend step. Nobody stands in for the head or for the approver.
 * Real HTTP and PostgreSQL; the worker's projection is run by hand.
 */
describe('a paid request of a department with no head: it waits, goes to the new head, then to the spending approver (e2e, QĐ-93c)', () => {
  let department: Department;
  let member: Person;
  let newHead: Person;
  let superAdminEmployeeId: string;
  let planId: string;
  let requestId: string;

  const requestOf = async () =>
    w.dataOf<{ request: AccessRequestWire }>(await w.fetch(requestId, member.account).expect(200)).request;
  const alertsOf = async (employeeId: string) =>
    (await w.noticesOf(employeeId, 'CONTROLLED_WAIT_ALERT')).filter((row) => row.subject_id === requestId);

  beforeAll(async () => {
    await w.start();
    await w.withApprover();
    planId = await w.planOf(await w.subscription(10));
    superAdminEmployeeId = (
      await w.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].employee_id;
    // A department with a Cost Center and its people, and no head.
    department = await w.departmentWithUnit('P-NHD');
    member = await w.staff(department, 'NHD-E');
    newHead = await w.staff(department, 'NHD-H');
  }, 180000);

  afterAll(async () => {
    await w.stop();
  });

  it('the request is sent and waits for a head, naming nobody; only the Super Admin is alerted, and nobody decides in the place of the head', async () => {
    const sent = await w.sent(member, planId, { termMonths: 1 });
    requestId = sent.id;
    // A request sent into a department with no head is alerted by the pass of the worker (the sweep), then projected.
    await w.sweep();
    await w.project();

    expect(sent).toMatchObject({
      state: 'WAITING_CONTROLLED',
      needStep: { state: 'WAITING', assignee: null, routingRow: 4, waitingReason: 'NO_DEPARTMENT_HEAD' },
    });
    expect((await alertsOf(superAdminEmployeeId)).map((row) => row.params)).toEqual([
      {
        requestId,
        stepKind: 'NEED',
        waitingReason: 'NO_DEPARTMENT_HEAD',
        configurationHint: 'ASSIGN_DEPARTMENT_HEAD',
      },
    ]);
    for (const other of [w.boss.employeeId, w.it1.employeeId, w.executiveHead.employeeId])
      expect(await alertsOf(other)).toEqual([]);
    await w.decide(requestId, { decision: 'APPROVE' }, w.boss.account).expect(404);
    expect((await requestOf()).needStep.state).toBe('WAITING');
  });

  it('the Super Admin names a head: the step goes to them at once and keeps its age', async () => {
    const waiting = await w.stepOf(requestId, 'NEED');

    await w.makeHead(department, newHead);

    expect(await requestOf()).toMatchObject({
      state: 'PENDING',
      needStep: { state: 'PENDING', assignee: { employeeId: newHead.employeeId }, routingRow: 1, waitingReason: null },
    });
    expect((await w.stepOf(requestId, 'NEED')).created_at).toEqual(waiting.created_at);
  });

  it('the new head approves the need and, with a budget in force, sends it on in a batch that the check routes to the approver', async () => {
    const unit: Unit = { department, head: newHead, member };
    await w.decide(requestId, { decision: 'APPROVE' }, newHead.account).expect(200);
    expect(await requestOf()).toMatchObject({
      state: 'AWAITING_SPEND_SUBMISSION',
      needDecision: { decision: 'APPROVED', decidedBy: { employeeId: newHead.employeeId }, deciderRole: 'MANAGER' },
    });
    await w.budgetFor(unit, { total: 100 * M, year: (await requestOf()).budgetYear ?? w.year });

    const batch = w.dataOf<{ batch: { id: string } }>(await w.sendOn([requestId], newHead.account).expect(201)).batch;

    expect((await requestOf()).state).toBe('AWAITING_SPEND_DECISION');
    const spend = await w.stepOf(requestId, 'SPEND_APPROVAL');
    expect(spend).toMatchObject({ state: 'PENDING', assignee_employee_id: w.boss.employeeId });
    const queue = w.dataOf<{ items: { requestId: string; batchId: string | null }[] }>(
      await w.approvals(w.boss.account, { pageSize: 100 }).expect(200),
    );
    expect(queue.items).toContainEqual(expect.objectContaining({ requestId, batchId: batch.id }));
    // Nobody but the spending approver may decide the batch (no substitute, QĐ-93c).
    await w
      .decideBatch(batch.id, { decision: 'APPROVE', requestIds: [requestId] }, w.executiveHead.account)
      .expect(404);
    expect((await requestOf()).state).toBe('AWAITING_SPEND_DECISION');

    const results = w.dataOf<{ results: { requestId: string; outcome: string }[] }>(
      await w.decideBatch(batch.id, { decision: 'APPROVE', requestIds: [requestId] }, w.boss.account).expect(200),
    ).results;

    expect(results).toEqual([expect.objectContaining({ requestId, outcome: 'APPROVED' })]);
    expect((await requestOf()).state).toBe('AWAITING_EXECUTION');
    const kept = await w.ctx.sql.query<{ kind: string; decider_role: string; decided_by: string }>(
      `SELECT s.kind::text, r.decider_role::text, r.decided_by_employee_id::text AS decided_by
         FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id
        WHERE r.request_id = $1 ORDER BY r.decided_at`,
      [requestId],
    );
    expect(kept.rows).toEqual([
      { kind: 'NEED', decider_role: 'MANAGER', decided_by: newHead.employeeId },
      { kind: 'SPEND_APPROVAL', decider_role: 'SPENDING_APPROVER', decided_by: w.boss.employeeId },
    ]);
  });
});
