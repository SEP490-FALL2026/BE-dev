import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import type { AccessRequestWire, Department, Person } from '../../support/request-harness';
import { StatusHarness } from '../../support/status-harness';

const h = new StatusHarness();

/**
 * The checklist of the assessment of a proposal (`PL-2.4`, `QĐ-111ap`, R-24) over real PostgreSQL: the answers kept with the completion, a No that locks
 * the completion, the reason of a refusal filled in from it, a proposal sent back to its sender with the step of the IT Admin closed and told, and the
 * sender sending it on again to a new step of the IT Admin, for a proposal that went through the head and for one that did not.
 */
describe('the checklist of the assessment of a proposal (integration, real PostgreSQL)', () => {
  let design: Department;
  let head: Person;
  let itInCharge: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-ACH');
    head = await h.staff(design, 'ACH-H1');
    itInCharge = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.makeHead(design, head);
    await h.setItAdminInCharge(design, itInCharge);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A proposal whose need the head has approved: it waits for the IT Admin, who has filled the assessment. */
  const awaiting = async (): Promise<AccessRequestWire & { sender: Person }> => {
    counter += 1;
    const sender = await h.staff(design, `ACH-P${counter}`);
    const proposed = await h.proposed(sender, { softwareName: `Tool ${counter}` });
    await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);
    await h.saveAssessment(proposed.id, h.assessmentBody(), itInCharge.account).expect(200);

    return { ...proposed, sender };
  };
  const post = (id: string, route: 'completion' | 'rejection', body: object, account = itInCharge.account) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/assessment/${route}`).set(h.as(account)).send(body);
  const resubmit = (id: string, account: Person['account']) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/resubmission`).set(h.as(account));
  /** The question the IT Admin answers No: the first of the person. */
  const questionNo = () => h.checklists.questionsOf('1.3')[0];
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM access_requests WHERE id = $1`, [id])).rows[0].state;
  const stepsOf = async (id: string) =>
    (
      await h.ctx.sql.query<{ kind: string; state: string; assignee_employee_id: string | null }>(
        `SELECT kind, state, assignee_employee_id FROM access_request_steps WHERE request_id = $1 ORDER BY sequence`,
        [id],
      )
    ).rows;
  const checklistsOf = (subjectId: string) =>
    h.ctx.sql
      .query<{ decision: string; has_no: boolean; step_code: string; policy_version_id: string }>(
        `SELECT decision, has_no, step_code, policy_version_id FROM decision_checklists
          WHERE subject_id = $1 AND step_code = '1.3' ORDER BY decided_at`,
        [subjectId],
      )
      .then((result) => result.rows);
  const recordsOf = (requestId: string) =>
    h.ctx.sql
      .query<{ decision: string }>(`SELECT decision FROM approval_records WHERE request_id = $1 ORDER BY decided_at`, [
        requestId,
      ])
      .then((result) => result.rows);
  const assessmentStatus = async (id: string) =>
    (
      await h.ctx.sql.query<{ status: string }>(`SELECT status FROM access_request_assessments WHERE request_id = $1`, [
        id,
      ])
    ).rows[0].status;

  describe('the completion', () => {
    it('keeps the answers with the version of the policy when every question is Yes', async () => {
      const proposed = await awaiting();

      const done = h.dataOf<{ request: AccessRequestWire }>(
        await post(proposed.id, 'completion', { checklist: h.checklists.yes('1.3') }).expect(200),
      ).request;

      expect(done.state).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await checklistsOf(proposed.id)).toEqual([
        {
          decision: 'COMPLETE',
          has_no: false,
          step_code: '1.3',
          policy_version_id: h.checklists.yes('1.3').policyVersionId,
        },
      ]);
    });

    it('is locked when an answer is No: names the question and writes nothing', async () => {
      const proposed = await awaiting();
      const no = questionNo();

      const response = await post(proposed.id, 'completion', { checklist: h.checklists.answer('1.3', [no]) }).expect(
        422,
      );

      expect(bodyOf(response).error.code).toBe('POLICY.CHECKLIST_HAS_NO');
      expect((bodyOf(response).error.details as { items?: unknown }).items).toEqual([
        expect.objectContaining({ code: no }),
      ]);
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      expect((await stepsOf(proposed.id))[1].state).toBe('PENDING');
      expect(await checklistsOf(proposed.id)).toEqual([]);
      expect(await assessmentStatus(proposed.id)).toBe('DRAFT');
    });

    it('asks for the checklist, and for an answer to every question', async () => {
      const proposed = await awaiting();
      const yes = h.checklists.yes('1.3');

      const none = await post(proposed.id, 'completion', {}).expect(422);
      const missing = await post(proposed.id, 'completion', { checklist: { ...yes, answers: [] } }).expect(422);

      expect(bodyOf(none).error.code).toBe('VALIDATION_ERROR');
      expect(bodyOf(missing).error.code).toBe('POLICY.CHECKLIST_INCOMPLETE');
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    });

    it('does not ask the checklist of a request that cannot be completed: the missing assessment is told first', async () => {
      counter += 1;
      const proposed = await h.proposed(await h.staff(design, `ACH-P${counter}`), { softwareName: `Tool ${counter}` });
      await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);

      const response = await post(proposed.id, 'completion', { checklist: h.checklists.yes('1.3') }).expect(422);

      expect(bodyOf(response).error.code).toBe('ASSESSMENT.INCOMPLETE');
      expect(await checklistsOf(proposed.id)).toEqual([]);
    });
  });

  describe('the refusal at the gate', () => {
    it('fills the reason in from the question answered No, and keeps the answers', async () => {
      const proposed = await awaiting();
      const no = questionNo();

      const after = h.dataOf<{ request: AccessRequestWire }>(
        await post(proposed.id, 'rejection', {
          decision: 'REJECT',
          kind: 'NOT_ELIGIBLE',
          checklist: h.checklists.answer('1.3', [no]),
        }).expect(200),
      ).request;

      expect(after.state).toBe('IT_REJECTED');
      const rows = await checklistsOf(proposed.id);
      expect(rows).toEqual([expect.objectContaining({ decision: 'REJECT', has_no: true })]);
      const [{ reason }] = (
        await h.ctx.sql.query<{ reason: string }>(
          `SELECT rejection_reason AS reason FROM access_request_assessments WHERE request_id = $1`,
          [proposed.id],
        )
      ).rows;
      expect(reason).toContain(no);
    });

    it('asks for a reason when every answer is Yes and none is given', async () => {
      const proposed = await awaiting();

      const response = await post(proposed.id, 'rejection', {
        decision: 'REJECT',
        kind: 'NOT_ELIGIBLE',
        checklist: h.checklists.yes('1.3'),
      }).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      expect(await checklistsOf(proposed.id)).toEqual([]);
    });
  });

  describe('sent back to its sender (R-24)', () => {
    it('closes the step of the IT Admin, tells the sender and keeps the answers, and nobody completes it meanwhile', async () => {
      const proposed = await awaiting();
      const no = questionNo();

      const returned = h.dataOf<{ request: AccessRequestWire }>(
        await post(proposed.id, 'rejection', {
          decision: 'RETURN',
          checklist: h.checklists.answer('1.3', [no]),
        }).expect(200),
      ).request;

      expect(returned.state).toBe('AWAITING_REQUESTER_REVISION');
      expect((await stepsOf(proposed.id)).map((step) => step.state)).toEqual(['APPROVED', 'CLOSED']);
      expect(await checklistsOf(proposed.id)).toEqual([expect.objectContaining({ decision: 'RETURN', has_no: true })]);
      expect(await recordsOf(proposed.id)).toEqual([expect.objectContaining({ decision: 'APPROVED' })]);
      expect(await assessmentStatus(proposed.id)).toBe('DRAFT');
      const event = (await h.auditEvents('ACCESS_REQUEST', proposed.id)).find(
        (found) => found.action === 'ACCESS_REQUEST.ASSESSMENT_RETURNED',
      );
      expect(event?.after).toMatchObject({ requestId: proposed.id, reason: expect.stringContaining(no) as unknown });
      await h.project();
      expect(
        (await h.noticesOf(proposed.sender.employeeId, 'REQUEST_RETURNED')).map((notice) => notice.params),
      ).toEqual([
        expect.objectContaining({
          requestId: proposed.id,
          by: 'IT_ASSESSMENT',
          reason: expect.stringContaining(no) as unknown,
        }),
      ]);
      expect(h.codeOf(await post(proposed.id, 'completion', { checklist: h.checklists.yes('1.3') }).expect(409))).toBe(
        'ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT',
      );
    });

    it('is allowed when every answer is Yes, with a reason typed; without one it is asked for', async () => {
      const proposed = await awaiting();

      const bare = await post(proposed.id, 'rejection', {
        decision: 'RETURN',
        checklist: h.checklists.yes('1.3'),
      }).expect(422);
      await post(proposed.id, 'rejection', {
        decision: 'RETURN',
        reason: 'Name the vendor of the tool',
        checklist: h.checklists.yes('1.3'),
      }).expect(200);

      expect(bodyOf(bare).error.code).toBe('VALIDATION_ERROR');
      expect(await stateOf(proposed.id)).toBe('AWAITING_REQUESTER_REVISION');
      expect(await checklistsOf(proposed.id)).toEqual([expect.objectContaining({ decision: 'RETURN', has_no: false })]);
    });

    it('opens a new step for the IT Admin when the sender sends it again, and the assessment already filled is kept', async () => {
      const proposed = await awaiting();
      await post(proposed.id, 'rejection', {
        decision: 'RETURN',
        reason: 'Add the number of seats',
        checklist: h.checklists.yes('1.3'),
      }).expect(200);

      expect((await resubmit(proposed.id, head.account).expect(403)).status).toBe(403);
      const again = h.dataOf<{ request: AccessRequestWire }>(
        await resubmit(proposed.id, proposed.sender.account).expect(200),
      ).request;

      expect(again.state).toBe('AWAITING_IT_ASSESSMENT');
      expect(await stepsOf(proposed.id)).toEqual([
        { kind: 'NEED', state: 'APPROVED', assignee_employee_id: head.employeeId },
        { kind: 'IT_ASSESSMENT', state: 'CLOSED', assignee_employee_id: itInCharge.employeeId },
        { kind: 'IT_ASSESSMENT', state: 'PENDING', assignee_employee_id: itInCharge.employeeId },
      ]);
      expect((await h.assessmentWire(proposed.id, itInCharge.account)).step).toMatchObject({
        state: 'PENDING',
        assignee: { employeeId: itInCharge.employeeId },
      });
      const queue = h.dataOf<{ items: { requestId: string }[] }>(
        await request(h.server()).get('/api/v1/assessment-queue').set(h.as(itInCharge.account)).expect(200),
      );
      expect(queue.items.map((item) => item.requestId)).toContain(proposed.id);
      const events = await h.auditEvents('ACCESS_REQUEST', proposed.id);
      expect(events.some((event) => event.action === 'ACCESS_REQUEST.RESUBMITTED')).toBe(true);

      const done = h.dataOf<{ request: AccessRequestWire }>(
        await post(proposed.id, 'completion', { checklist: h.checklists.yes('1.3') }).expect(200),
      ).request;
      expect(done.state).toBe('AWAITING_SPEND_SUBMISSION');
      expect((await stepsOf(proposed.id)).map((step) => step.state)).toEqual(['APPROVED', 'CLOSED', 'APPROVED']);
      expect((await checklistsOf(proposed.id)).map((row) => row.decision)).toEqual(['RETURN', 'COMPLETE']);
    });

    it('goes back to the assessment, not to the spend step, for a proposal of the head, which has no need step', async () => {
      const proposed = await h.proposed(head, { softwareName: 'Head tool' });
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      await post(proposed.id, 'rejection', {
        decision: 'RETURN',
        reason: 'Say who will use it',
        checklist: h.checklists.yes('1.3'),
      }).expect(200);

      const again = h.dataOf<{ request: AccessRequestWire }>(
        await resubmit(proposed.id, head.account).expect(200),
      ).request;

      expect(again.state).toBe('AWAITING_IT_ASSESSMENT');
      expect((await stepsOf(proposed.id)).map((step) => `${step.kind}:${step.state}`)).toEqual([
        'NEED:NOT_REQUIRED',
        'IT_ASSESSMENT:CLOSED',
        'IT_ASSESSMENT:PENDING',
      ]);
    });
  });
});
