import { addDays } from '../../src/core/business-date';
import { assignHead } from '../support/builders/organization.builder';
import type { AccessRequestWire, Department, Person } from '../support/request-harness';
import { StatusHarness } from '../support/status-harness';

const w = new StatusHarness();

/**
 * A department with no head keeps a paid request waiting for one (`QĐ-110i`, MF1-X): no one-step route, the Super Admin alone is told, and
 * the head named later decides the need and sends it on as spend. Free internal software is the one request that goes straight to the IT Admin.
 */
describe('QĐ-110i a headless department keeps a paid request waiting for a head (e2e)', () => {
  let department: Department;
  let member: Person;
  let newHead: Person;
  let planId: string;
  let internalPlan: string;
  let requestId: string;
  let superAdminEmployeeId: string;
  const requestOf = async () =>
    w.dataOf<{ request: AccessRequestWire }>(await w.fetch(requestId, member.account).expect(200)).request;
  const alertsAbout = async (employeeId: string) =>
    (await w.noticesOf(employeeId, 'CONTROLLED_WAIT_ALERT')).filter((row) => row.subject_id === requestId);

  beforeAll(async () => {
    await w.start();
    await w.withApprover();
    planId = await w.planOf(await w.subscription(10));
    internalPlan = await w.plan('K5');
    department = await w.departmentWithUnit('P-NHD');
    member = await w.staff(department, 'NHD-E');
    newHead = await w.staff(department, 'NHD-H');
    superAdminEmployeeId = (
      await w.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].employee_id;
  }, 180000);

  afterAll(async () => {
    await w.stop();
  });

  it('QĐ-110i keeps a paid request waiting at the need step, with no approval record, and tells the Super Admin alone', async () => {
    const sent = await w.sent(member, planId, { termMonths: 1 });
    requestId = sent.id;
    await w.sweep();
    await w.project();
    expect(sent).toMatchObject({
      state: 'WAITING_CONTROLLED',
      routing: { mode: 'VIA_HEAD', oneStepReason: null },
      needStep: { state: 'WAITING', assignee: null, routingRow: 4, waitingReason: 'NO_DEPARTMENT_HEAD' },
    });
    const kept = await w.ctx.sql.query(`SELECT id FROM approval_records WHERE request_id = $1`, [requestId]);
    expect(kept.rows).toEqual([]);
    expect(await alertsAbout(superAdminEmployeeId)).toHaveLength(1);
    for (const employeeId of [w.boss.employeeId, w.it1.employeeId, newHead.employeeId, member.employeeId]) {
      expect(await alertsAbout(employeeId)).toEqual([]);
    }
  });

  it('QĐ-110i the head who is named takes the step with its deadline where it was, and nobody else can decide it', async () => {
    const waiting = await w.stepOf(requestId, 'NEED');
    await w.makeHead(department, newHead);

    expect(await requestOf()).toMatchObject({
      state: 'PENDING',
      routing: { mode: 'VIA_HEAD' },
      needStep: { state: 'PENDING', assignee: { employeeId: newHead.employeeId }, waitingReason: null },
    });
    expect((await w.stepOf(requestId, 'NEED')).created_at).toEqual(waiting.created_at);
    // The spending approver does not take the need step in place of a head: only the head of today decides it, and nobody else reads it.
    await w.decide(requestId, { decision: 'APPROVE' }, w.boss.account).expect(404);
    await w.decide(requestId, { decision: 'APPROVE' }, newHead.account).expect(200);
    expect((await requestOf()).state).toBe('AWAITING_SPEND_SUBMISSION');
  });

  it('QĐ-110i the new head sends it on as spend and the spending approver decides it: one record for each of the two steps', async () => {
    await w.budgetFor({ department, head: newHead, member }, { total: 100_000_000, year: w.year });
    const batch = w.dataOf<{ batch: { id: string } }>(await w.sendOn([requestId], newHead.account).expect(201)).batch;
    expect((await requestOf()).state).toBe('AWAITING_SPEND_DECISION');
    // P1-09/P1-10: the head of today reads the requests of the department, so a spend decision they do not hold is refused, 403, not hidden.
    await w.decideSpend(requestId, { decision: 'APPROVE' }, newHead.account).expect(403);
    expect((await requestOf()).state).toBe('AWAITING_SPEND_DECISION');

    await w.decideBatch(batch.id, { decision: 'APPROVE', requestIds: [requestId] }, w.boss.account).expect(200);

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

  it('QĐ-110i M-15 a future successor does not give a newly sent paid request a one-step route: it waits for that head', async () => {
    const gap = await w.departmentWithUnit('P-GAP');
    const sender = await w.staff(gap, 'GAP-E');
    const successor = await w.staff(gap, 'GAP-H');
    await assignHead(w.ctx, w.admin, gap.id, {
      employeeId: successor.employeeId,
      effectiveFrom: addDays(w.today(), 1),
    });

    expect(await w.sent(sender, planId, { termMonths: 1 })).toMatchObject({
      state: 'WAITING_CONTROLLED',
      routing: { mode: 'VIA_HEAD', oneStepReason: null },
      needStep: { state: 'WAITING', assignee: null, waitingReason: 'NO_DEPARTMENT_HEAD' },
    });
  });

  it('QĐ-111bc free internal software goes straight to the IT Admin from a headless department, flagged for the audit of the Super Admin', async () => {
    const free = await w.departmentWithUnit('P-FREE');
    const sender = await w.staff(free, 'FREE-E');

    const sent = await w.sent(sender, internalPlan);

    expect(sent).toMatchObject({
      state: 'AWAITING_EXECUTION',
      routing: { mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' },
      needStep: { state: 'NOT_REQUIRED', assignee: null, routingRow: 4 },
    });
    expect((await w.auditEvents('ACCESS_REQUEST', sent.id)).map((event) => event.action)).toContain(
      'ACCESS_REQUEST.NO_NEED_APPROVER',
    );
  });
});
