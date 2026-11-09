import { GroupHarness } from '../../support/group-harness';
import type { AccessRequestWire } from '../../support/request-harness';
const h = new GroupHarness();
describe('BR-MF1-02: one-step proposals and group requests', () => {
  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);
  afterAll(async () => h.stop());
  it('BR-MF1-02: head proposal has no need decision and assessment completion checks the budget immediately', async () => {
    const u = await h.departmentWithHead('P-PROPONE');
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const sent = await h.proposed(u.head);
    expect(sent.state).toBe('AWAITING_IT_ASSESSMENT');
    expect(sent.needStep.state).toBe('NOT_REQUIRED');
    expect((await h.assessmentWire(sent.id, h.it1)).step?.state).toBe('PENDING');
    await h
      .saveAssessment(
        sent.id,
        h.assessmentBody({
          quote: {
            unitPrice: { amount: '8000', currency: 'VND' },
            billingCycle: 'MONTHLY',
            validFrom: '2026-01-01',
            validUntil: null,
          },
        }),
        h.it1,
      )
      .expect(200);
    const response = await h.completeAssessment(sent.id, h.it1).expect(200);
    const final = h.dataOf<{ request: AccessRequestWire }>(response).request;
    expect(final.state).toBe('AWAITING_REQUESTER_REVISION');
    expect(final.spend?.blockedReasons).toEqual(['NO_APPROVED_BUDGET']);
    expect((await h.ctx.sql.query(`SELECT 1 FROM approval_records WHERE request_id=$1`, [sent.id])).rows).toHaveLength(
      0,
    );
  });
  it('BR-MF1-02 P2-05: internal registration needs no owner input and retains the one-step audit flag', async () => {
    const u = await h.departmentWithHead('P-REGONE');
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const sent = await h.proposed(u.head, { softwareName: 'InternalOneStepPortal' });
    await h.saveAssessment(sent.id, { classification: 'INTERNAL', dataSensitivity: 'LOW' }, h.it1).expect(200);
    const response = await h.registerInternal(sent.id, {}, h.it1).expect(200);
    const final = h.dataOf<{ request: AccessRequestWire }>(response).request;
    expect(final.state).toBe('AWAITING_EXECUTION');
    expect(final.branch).toBe('INTERNAL_FREE');
    expect((await h.auditEvents('ACCESS_REQUEST', sent.id)).map((event) => event.action)).toContain(
      'ACCESS_REQUEST.NO_NEED_APPROVER',
    );
  });
  it('BR-MF1-02: a member group without a head has confirmed lines and one spend decision', async () => {
    const u = await h.departmentWithHead('P-GRPONE');
    await h.budgetFor(u, { total: 1_000_000_000 });
    const plan = await h.planOf(await h.subscription(100));
    const people = [u.member, await h.colleague(u)];
    await h.ctx.sql.query(`DELETE FROM department_head_periods WHERE department_id=$1`, [u.department.id]);
    const response = await h.submitGroup(h.groupBody(plan, people), u.member.account).expect(201);
    const sent = h.dataOf<{ request: AccessRequestWire }>(response).request;
    expect(sent.routing).toEqual({ mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' });
    expect(sent.state).toBe('AWAITING_SPEND_DECISION');
    const lines = h.dataOf<{ items: Array<{ state: string; needStep: { state: string } }> }>(
      await h.linesOf(sent.id, u.member.account).expect(200),
    ).items;
    expect(lines).toHaveLength(2);
    for (const line of lines)
      expect(line).toMatchObject({ state: 'NEED_CONFIRMED', needStep: { state: 'NOT_REQUIRED' } });
    await h
      .decideSpendLines(
        sent.id,
        { lines: people.map((person) => ({ employeeId: person.employeeId, decision: 'APPROVE' })) },
        h.boss.account,
      )
      .expect(200);
    expect(
      (
        await h.ctx.sql.query(
          `SELECT 1 FROM approval_records WHERE request_id=$1 AND decider_role='SPENDING_APPROVER'`,
          [sent.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('BR-MF1-02: head group stays VIA_HEAD and in the batch queue, with the current group bound', async () => {
    const u = await h.departmentWithHead('P-GRPHEAD');
    const other = await h.colleague(u);
    const plan = await h.plan('K2');
    const response = await h.submitGroup(h.groupBody(plan, [u.member, other]), u.head.account).expect(201);
    const sent = h.dataOf<{ request: AccessRequestWire }>(response).request;
    expect(sent.routing.mode).toBe('VIA_HEAD');
    expect(sent.state).toBe('AWAITING_SPEND_SUBMISSION');
    const queue = h.dataOf<{ items: Array<{ requestId: string }> }>(
      await h.spendQueue(u.head.account).expect(200),
    ).items;
    expect(queue.some((row) => row.requestId === sent.id)).toBe(true);
    const refused = await h.checkGroup(h.groupBody(plan, [u.head, u.member]), u.head.account).expect(200);
    expect(h.dataOf<{ lines: Array<{ employeeId: string; reason: string }> }>(refused).lines).toContainEqual(
      expect.objectContaining({ employeeId: u.head.employeeId, reason: 'HEAD_IN_GROUP' }),
    );
  });
});
