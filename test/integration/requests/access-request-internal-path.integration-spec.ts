import { randomUUID } from 'node:crypto';
import { AccessRequestWire, Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

describe('requests over HTTP: from an approved request to a granted seat (integration, real PostgreSQL)', () => {
  let design: Department;
  let head: Person;
  let spender: Person;
  let paidPlan: string;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    head = await h.staff(design, 'DES-H1');
    await h.makeHead(design, head);
    spender = await h.staff(await h.departmentWithUnit('P-EXE'), 'EXE-C1');
    await h.setRole('SPENDING_APPROVER', spender);
    paidPlan = await h.plan('K2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  let counter = 0;
  /** A fresh person who asks for a fresh internal tool: nothing is shared between the tests. */
  const asker = async () => {
    counter += 1;
    const person = await h.staff(design, `DES-E${counter}`);

    return { person, planId: await h.plan('K5'), code: `DES-E${counter}` };
  };
  const approved = async (person: Person, planId: string, extra: Record<string, unknown> = {}) => {
    const sent = await h.sent(person, planId, extra);
    await h.decide(sent.id, { decision: 'APPROVE', ...extra }, head.account).expect(200);

    return sent.id;
  };
  const stateOf = async (id: string) =>
    h.dataOf<{ request: AccessRequestWire }>(await h.fetch(id, head.account).expect(200)).request.state;
  const assignmentsOf = async (employeeId: string, planId: string) =>
    (
      await h.ctx.sql.query<{ source: string }>(
        `SELECT source FROM license_assignments WHERE employee_id = $1 AND plan_id = $2`,
        [employeeId, planId],
      )
    ).rows;
  const taskOf = async (id: string) =>
    h.dataOf<{ task: { id: string; status: string } }>(await h.grant({ requestId: id }).expect(201)).task;

  describe('an internal tool with no fee (US-05-20 AC-1, AC-2, AC-7)', () => {
    it('goes from the approval of the head straight to the IT Admin: no spend step, no seat question', async () => {
      const { person, planId } = await asker();
      const requestId = await approved(person, planId);

      const task = await taskOf(requestId);

      expect(task.status).toBe('QUEUED');
      expect(await stateOf(requestId)).toBe('EXECUTING');
      expect(await assignmentsOf(person.employeeId, planId)).toEqual([{ source: 'REQUEST' }]);
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM access_request_steps WHERE request_id = $1`, [requestId])).rowCount,
      ).toBe(1);
    });

    it('is completed only with evidence, and the request is completed with it', async () => {
      const { person, planId } = await asker();
      const requestId = await approved(person, planId);
      const task = await taskOf(requestId);
      await h.claim(task.id).expect(200);

      expect(h.codeOf(await h.complete(task.id, { evidence: '  ' }).expect(422))).toBe(
        'PROVISIONING_TASK.EVIDENCE_REQUIRED',
      );
      expect(await stateOf(requestId)).toBe('EXECUTING');
      await h.complete(task.id, { evidence: 'Added to the portal by IT1' }).expect(200);

      expect(await stateOf(requestId)).toBe('COMPLETED');
      const events = await h.auditEvents('ACCESS_REQUEST', requestId);
      expect(events.map((event) => event.action)).toEqual([
        'ACCESS_REQUEST.SUBMITTED',
        'ACCESS_REQUEST.GRANT_STARTED',
        'ACCESS_REQUEST.GRANT_COMPLETED',
      ]);
    });

    it('never gives the spending approver a step or a view of it (AC-7)', async () => {
      const { person, planId } = await asker();
      const requestId = await approved(person, planId);

      expect(h.codeOf(await h.fetch(requestId, spender.account).expect(404))).toBe('ACCESS_REQUEST.NOT_FOUND');
      expect(
        (
          await h.ctx.sql.query(
            `SELECT 1 FROM access_request_steps WHERE request_id = $1 AND assignee_employee_id = $2`,
            [requestId, spender.employeeId],
          )
        ).rowCount,
      ).toBe(0);
    });
  });

  describe('only a request that is approved and not yet granted may be granted (US-07-01 AC-3, AC-16)', () => {
    it.each([
      ['has not been decided', 'PROVISIONING.REQUEST_NOT_APPROVED', false],
      ['was refused', 'PROVISIONING.REQUEST_ENDED', true],
    ])('refuses a request that %s and creates nothing', async (_name, code, refuse) => {
      const { person, planId } = await asker();
      const sent = await h.sent(person, planId);
      if (refuse) await h.decide(sent.id, { decision: 'REJECT', reason: 'No need' }, head.account).expect(200);
      const before = await h.requestRows();
      const tasksBefore = await h.count('provisioning_tasks');

      expect(h.codeOf(await h.grant({ requestId: sent.id }).expect(409))).toBe(code);

      expect(await assignmentsOf(person.employeeId, planId)).toEqual([]);
      expect(await h.count('provisioning_tasks')).toBe(tasksBefore);
      expect(await h.requestRows()).toBe(before);
      expect(await stateOf(sent.id)).toBe(refuse ? 'REJECTED' : 'PENDING');
    });

    it('refuses paid software whose spend has not been decided', async () => {
      const { person } = await asker();
      const requestId = await approved(person, paidPlan);

      expect(await stateOf(requestId)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(h.codeOf(await h.grant({ requestId }).expect(409))).toBe('PROVISIONING.REQUEST_NOT_APPROVED');
      expect(await assignmentsOf(person.employeeId, paidPlan)).toEqual([]);
    });

    it('does not know a request that does not exist', async () => {
      expect(h.codeOf(await h.grant({ requestId: randomUUID() }).expect(404))).toBe('REQUEST.NOT_FOUND');
    });

    it('grants a request once: a second grant finds it granted, and two at the same time make one', async () => {
      const first = await asker();
      const once = await approved(first.person, first.planId);
      await taskOf(once);
      expect(h.codeOf(await h.grant({ requestId: once }).expect(409))).toBe('PROVISIONING.REQUEST_ENDED');

      const second = await asker();
      const twice = await approved(second.person, second.planId);
      const answers = await Promise.all([h.grant({ requestId: twice }), h.grant({ requestId: twice })]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
      expect(await assignmentsOf(second.person.employeeId, second.planId)).toHaveLength(1);
      expect(await assignmentsOf(first.person.employeeId, first.planId)).toHaveLength(1);
    });

    it('leaves the request granted-to-be when the grant itself is refused: nothing is half done', async () => {
      const { person, planId, code } = await asker();
      const { id: requestId } = await h.sent(person, planId);
      // The seat is recorded after the request was sent, so sending was allowed and only the grant can refuse it.
      await h.hold(code, planId);
      await h.decide(requestId, { decision: 'APPROVE' }, head.account).expect(200);

      const response = await h.grant({ requestId });

      expect(response.status).toBe(422);
      expect(h.codeOf(response)).toBe('LICENSE_ASSIGNMENT.OVERLAP');
      expect(await stateOf(requestId)).toBe('AWAITING_EXECUTION');
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM provisioning_tasks WHERE request_id = $1`, [requestId])).rowCount,
      ).toBe(0);
    });
  });

  describe('how the grant ends (FR-2.5)', () => {
    it('fails the request only when the IT Admin closes the grant as failed', async () => {
      const { person, planId } = await asker();
      const requestId = await approved(person, planId);
      const task = await taskOf(requestId);
      await h.claim(task.id).expect(200);

      await h.fail(task.id, { reason: 'The portal refused the account' }).expect(200);
      expect(await stateOf(requestId)).toBe('EXECUTING');
      await h.closeFailed(task.id, { reason: 'The portal cannot hold the account' }).expect(200);

      expect(await stateOf(requestId)).toBe('FAILED');
      const events = await h.auditEvents('ACCESS_REQUEST', requestId);
      expect(events.map((event) => event.action)).toContain('ACCESS_REQUEST.GRANT_FAILED');
    });
  });
});
