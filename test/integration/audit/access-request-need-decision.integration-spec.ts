import { AuditApi } from '../../../src/modules/audit/public/audit.api';
import { AccessRequestWire, Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

describe('requests over HTTP: deciding the need step (integration, real PostgreSQL)', () => {
  let design: Department;
  let engineering: Department;
  let executive: Department;
  let headless: Department;
  let head: Person; // head of design
  let designer: Person;
  let otherHead: Person; // head of engineering
  let boss: Person; // the spending approver, a member of executive (QĐ-93b)
  let waiter: Person; // a member of the department with no head: what they ask for waits for a head
  let internalPlan: string;
  let paidPlan: string;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    engineering = await h.departmentWithUnit('P-ENG');
    executive = await h.departmentWithUnit('P-EXE');
    headless = await h.departmentWithUnit('P-HR');
    head = await h.staff(design, 'DES-H1');
    designer = await h.staff(design, 'DES-E1');
    otherHead = await h.staff(engineering, 'ENG-H2');
    boss = await h.staff(executive, 'EXE-C1');
    waiter = await h.staff(headless, 'HR-E1');
    await h.makeHead(design, head);
    await h.makeHead(engineering, otherHead);
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
    internalPlan = await h.plan('K5');
    paidPlan = await h.plan('K2');
  }, 240000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  const approve = { decision: 'APPROVE' };
  const decided = async (id: string, body: object, account: Person['account']): Promise<AccessRequestWire> =>
    h.dataOf<{ request: AccessRequestWire }>(await h.decide(id, body, account).expect(200)).request;
  const stepsOf = async (requestId: string) =>
    (await h.ctx.sql.query(`SELECT 1 FROM access_request_steps WHERE request_id = $1`, [requestId])).rowCount;
  const recordsOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ decision: string; decider_role: string; reason: string | null }>(
        `SELECT decision, decider_role, reason FROM approval_records WHERE request_id = $1`,
        [requestId],
      )
    ).rows;

  describe('approving (AC-1)', () => {
    it('sends internal software on to the IT Admin and records who decided, in which role', async () => {
      const sent = await h.sent(designer, internalPlan);

      const after = await decided(sent.id, approve, head.account);

      expect(after.state).toBe('AWAITING_EXECUTION');
      expect(after.needStep).toMatchObject({ state: 'APPROVED', assignee: { employeeId: head.employeeId } });
      expect(after.needStep.decidedAt).not.toBeNull();
      expect(after.needDecision).toMatchObject({
        decision: 'APPROVED',
        decidedBy: { employeeId: head.employeeId },
        deciderRole: 'MANAGER',
        reason: null,
      });
      const events = await h.auditEvents('ACCESS_REQUEST_STEP', sent.needStep.id);
      const approved = events.find((e) => e.action === 'ACCESS_REQUEST.NEED_APPROVED');
      expect(events.map((e) => e.action)).toEqual(['ACCESS_REQUEST.NEED_STEP_ROUTED', 'ACCESS_REQUEST.NEED_APPROVED']);
      expect(approved?.after).toMatchObject({
        assigneeEmployeeId: head.employeeId,
        decidedByEmployeeId: head.employeeId,
        deciderRole: 'MANAGER',
        departmentId: design.id,
        requestState: 'AWAITING_EXECUTION',
      });
      expect(approved?.actor_app_user_id).toBe(head.account.appUserId);
    });

    it('sends paid software on to the spend submission of the head, with no spend step yet (AC-6)', async () => {
      const sent = await h.sent(designer, paidPlan);

      const after = await decided(sent.id, approve, head.account);

      expect(after.state).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await stepsOf(sent.id)).toBe(1);
    });
  });

  describe('refusing (AC-2, AC-5)', () => {
    it('does not save a refusal without a reason', async () => {
      const sent = await h.sent(designer, paidPlan);

      for (const body of [{ decision: 'REJECT' }, { decision: 'REJECT', reason: '   ' }]) {
        const response = await h.decide(sent.id, body, head.account).expect(422);
        expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
        expect((h.detailsOf(response).issues as { path: string }[]).map((i) => i.path)).toContain('reason');
      }
      const unchanged = h.dataOf<{ request: AccessRequestWire }>(
        await h.fetch(sent.id, head.account).expect(200),
      ).request;
      expect(unchanged).toMatchObject({ state: 'PENDING', needDecision: null, needStep: { state: 'PENDING' } });
      expect(await recordsOf(sent.id)).toEqual([]);
    });

    it('ends the request refused with the reason the sender can read, and no spend step or commitment', async () => {
      const sent = await h.sent(designer, paidPlan);

      const after = await decided(sent.id, { decision: 'REJECT', reason: 'No need' }, head.account);
      const read = h.dataOf<{ request: AccessRequestWire }>(
        await h.fetch(sent.id, designer.account).expect(200),
      ).request;

      expect(after).toMatchObject({ state: 'REJECTED', needStep: { state: 'REJECTED' } });
      expect(read.needDecision).toMatchObject({ decision: 'REJECTED', reason: 'No need', deciderRole: 'MANAGER' });
      expect(await stepsOf(sent.id)).toBe(1);
      expect(await recordsOf(sent.id)).toEqual([{ decision: 'REJECTED', decider_role: 'MANAGER', reason: 'No need' }]);
    });
  });

  describe('who may decide (AC-4, AC-8)', () => {
    it('refuses the head of another department, an IT Admin, and the person who sent the request', async () => {
      const sent = await h.sent(designer, internalPlan);

      expect(h.codeOf(await h.decide(sent.id, approve, otherHead.account).expect(404))).toBe(
        'ACCESS_REQUEST.NOT_FOUND',
      );
      expect(h.codeOf(await h.decide(sent.id, approve, h.it1).expect(403))).toBe('ACCESS_REQUEST.NOT_THE_ASSIGNEE');
      expect(h.codeOf(await h.decide(sent.id, approve, designer.account).expect(403))).toBe(
        'ACCESS_REQUEST.OWN_REQUEST',
      );

      const unchanged = h.dataOf<{ request: AccessRequestWire }>(
        await h.fetch(sent.id, head.account).expect(200),
      ).request;
      expect(unchanged).toMatchObject({ state: 'PENDING', needStep: { state: 'PENDING' }, needDecision: null });
      expect(await recordsOf(sent.id)).toEqual([]);
    });

    it('does not let a head decide their own request: the spending approver does, in that role', async () => {
      const sent = await h.sent(head, internalPlan);

      expect(h.codeOf(await h.decide(sent.id, approve, head.account).expect(403))).toBe('ACCESS_REQUEST.OWN_REQUEST');
      const after = await decided(sent.id, approve, boss.account);

      expect(after.needDecision).toMatchObject({
        decidedBy: { employeeId: boss.employeeId },
        deciderRole: 'SPENDING_APPROVER',
      });
    });

    it('leaves a request that waits for a head undecided, for the person who asked and for everybody else (QĐ-93c)', async () => {
      const sent = await h.sent(waiter, internalPlan);

      expect(sent.state).toBe('WAITING_CONTROLLED');
      expect(h.codeOf(await h.decide(sent.id, approve, h.it1).expect(403))).toBe('ACCESS_REQUEST.NOT_THE_ASSIGNEE');
      expect(h.codeOf(await h.decide(sent.id, approve, waiter.account).expect(403))).toBe('ACCESS_REQUEST.OWN_REQUEST');
    });

    it('decides a step once: the second decision finds it decided and writes no second record', async () => {
      const sent = await h.sent(designer, internalPlan);
      await decided(sent.id, approve, head.account);

      expect(h.codeOf(await h.decide(sent.id, approve, head.account).expect(409))).toBe(
        'ACCESS_REQUEST.STEP_NOT_PENDING',
      );
      expect(
        h.codeOf(await h.decide(sent.id, { decision: 'REJECT', reason: 'Changed my mind' }, head.account).expect(409)),
      ).toBe('ACCESS_REQUEST.STEP_NOT_PENDING');
      expect(await recordsOf(sent.id)).toHaveLength(1);
    });
  });

  describe('a term of more than twelve months (QĐ-98)', () => {
    it('is not taken when the request is sent: a request asks for a year at most, and nothing is written', async () => {
      const before = await h.requestRows();

      const response = await h.submit(h.form(internalPlan, { termMonths: 13 }), designer.account).expect(422);

      // An end date past a year from today is the domain's refusal (`US-05-23` AC-9), not a malformed body.
      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.END_DATE_OUT_OF_RANGE');
      expect(await h.requestRows()).toBe(before);
    });

    it('needs no confirmation at twelve months, or to be refused, and adds no step', async () => {
      const twelve = await h.sent(designer, internalPlan, { termMonths: 12 });
      const refused = await h.sent(designer, internalPlan, { termMonths: 12 });

      expect((await decided(twelve.id, approve, head.account)).state).toBe('AWAITING_EXECUTION');
      expect(await stepsOf(twelve.id)).toBe(1);
      expect((await decided(refused.id, { decision: 'REJECT', reason: 'Too long' }, head.account)).state).toBe(
        'REJECTED',
      );
    });

    it('does not take a confirmation in words with an approval or a refusal: nothing lifts the limit', async () => {
      const sent = await h.sent(designer, internalPlan, { termMonths: 12 });
      const confirmation = { termConfirmation: { reason: 'Long' } };

      const approved = await h.decide(sent.id, { ...approve, ...confirmation }, head.account).expect(422);
      const refused = await h
        .decide(sent.id, { decision: 'REJECT', reason: 'No', ...confirmation }, head.account)
        .expect(422);

      expect(h.codeOf(approved)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');
      const after = h.dataOf<{ request: AccessRequestWire }>(await h.fetch(sent.id, head.account).expect(200)).request;
      expect(after.state).toBe('PENDING');
    });
  });

  describe('the electronic approval record (AC-9, US-01-12 AC-6, AC-7)', () => {
    it('is never changed or deleted, not even by SQL', async () => {
      const sent = await h.sent(designer, internalPlan);
      await decided(sent.id, approve, head.account);

      for (const text of [
        `UPDATE approval_records SET reason = 'x' WHERE request_id = $1`,
        `DELETE FROM approval_records WHERE request_id = $1`,
      ]) {
        await expect(h.ctx.sql.query(text, [sent.id])).rejects.toMatchObject({ code: '23001' });
      }
      await expect(h.ctx.sql.query(`TRUNCATE approval_records`)).rejects.toMatchObject({ code: '23001' });
      expect(await recordsOf(sent.id)).toHaveLength(1);
    });

    it('has no signature or certificate to attach, and is the same from any client', async () => {
      const sent = await h.sent(designer, internalPlan);

      for (const extra of [{ signature: 'x' }, { certificate: 'x' }, { decidedBy: head.employeeId }]) {
        expect(h.codeOf(await h.decide(sent.id, { ...approve, ...extra }, head.account).expect(422))).toBe(
          'VALIDATION_ERROR',
        );
      }
      const mobile = await h
        .decide(sent.id, approve, head.account)
        .set('User-Agent', 'SaaSSentryMobile/1.0')
        .expect(200);

      expect(h.dataOf<{ request: AccessRequestWire }>(mobile).request.needDecision).toMatchObject({
        deciderRole: 'MANAGER',
      });
    });
  });

  it('leaves the step, the request, the record and the audit event as they were when the audit event cannot be written', async () => {
    const sent = await h.sent(designer, internalPlan);
    const audit = h.ctx.app.get(AuditApi);
    jest.spyOn(audit, 'record').mockRejectedValue(new Error('audit down'));

    await h.decide(sent.id, approve, head.account).expect(500);
    jest.restoreAllMocks();

    const unchanged = h.dataOf<{ request: AccessRequestWire }>(
      await h.fetch(sent.id, head.account).expect(200),
    ).request;
    expect(unchanged).toMatchObject({
      state: 'PENDING',
      needStep: { state: 'PENDING', decidedAt: null },
      needDecision: null,
    });
    expect(await recordsOf(sent.id)).toEqual([]);
  });
});
