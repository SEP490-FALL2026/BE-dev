import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuditApi } from '../../../src/modules/audit/public/audit.api';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

describe('requests over HTTP: sending and routing the need step (integration, real PostgreSQL)', () => {
  let design: Department;
  let engineering: Department;
  let executive: Department;
  let headless: Department;
  let head: Person; // head of design
  let designer: Person; // member of design
  let boss: Person; // the spending approver, a member of executive (QĐ-93b)
  let fallback: Person; // the fallback approver, a member of the department that has no head
  let clerk: Person; // member of the department that has no head
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
    boss = await h.staff(executive, 'EXE-C1');
    fallback = await h.staff(headless, 'HR-R0');
    clerk = await h.staff(headless, 'HR-E4');
    await h.makeHead(design, head);
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
    await h.setRole('FALLBACK_APPROVER', fallback);
    internalPlan = await h.plan('K5');
    paidPlan = await h.plan('K2');
  }, 240000);

  afterEach(async () => {
    jest.restoreAllMocks();
    await h.setParameter('APPROVAL_SLA_WORKING_DAYS', 2);
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('the routing table of US-05-03', () => {
    it('row 1: gives the need step to the head of the department of the sender, charged to its Unit (AC-1, AC-7)', async () => {
      const sent = await h.sent(designer, internalPlan);

      expect(sent).toMatchObject({
        state: 'PENDING',
        branch: 'INTERNAL_FREE',
        department: { id: design.id, code: 'P-DES' },
        costCenter: { id: design.unitId },
        requester: { employeeId: designer.employeeId },
        beneficiary: { employeeId: designer.employeeId },
        needStep: { state: 'PENDING', routingRow: 1, assignee: { employeeId: head.employeeId }, waitingReason: null },
      });
    });

    it('row 1 reads the department and its head on the day of sending, not the department the sender came from (AC-1)', async () => {
      const mover = await h.staff(engineering, 'ENG-MOVER');
      const engineeringHead = await h.staff(engineering, 'ENG-H2');
      await h.makeHead(engineering, engineeringHead);
      const today = h.today();
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_from = '2026-10-01', valid_to = $2::date WHERE employee_id = $1`,
        [mover.employeeId, today],
      );
      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         SELECT gen_random_uuid(), organization_id, employee_id, $2, $3::date
           FROM employee_placements WHERE employee_id = $1 ORDER BY valid_from LIMIT 1`,
        [mover.employeeId, design.id, today],
      );

      const sent = await h.sent(mover, internalPlan);

      expect(sent.department.id).toBe(design.id);
      expect(sent.costCenter.id).toBe(design.unitId);
      expect(sent.needStep.assignee?.employeeId).toBe(head.employeeId);
      expect(sent.needStep.assignee?.employeeId).not.toBe(engineeringHead.employeeId);
    });

    it('row 2: a head who sends for themselves is not given their own step; the spending approver is (AC-2)', async () => {
      const sent = await h.sent(head, paidPlan);

      expect(sent.needStep).toMatchObject({ routingRow: 2, assignee: { employeeId: boss.employeeId } });
      expect(sent.needStep.assignee?.employeeId).not.toBe(head.employeeId);
    });

    it('row 4: a department that has no head gives the step to the fallback approver (AC-4)', async () => {
      const sent = await h.sent(clerk, internalPlan);

      expect(sent.needStep).toMatchObject({ routingRow: 4, assignee: { employeeId: fallback.employeeId } });
    });

    it('row 8: the fallback approver who sends from a department with no head is not given their own step; the request waits (AC-5)', async () => {
      const sent = await h.sent(fallback, internalPlan);

      expect(sent.state).toBe('WAITING_CONTROLLED');
      expect(sent.needStep).toMatchObject({
        state: 'WAITING',
        routingRow: 8,
        assignee: null,
        assignedAt: null,
        waitingReason: 'FALLBACK_IS_REQUESTER',
      });
    });

    it('row 2 with no spending approver: the request waits and is not handed to the fallback approver (AC-13, QĐ-66k)', async () => {
      await h.clearRole('SPENDING_APPROVER');
      try {
        const sent = await h.sent(head, paidPlan);

        expect(sent.state).toBe('WAITING_CONTROLLED');
        expect(sent.needStep).toMatchObject({ assignee: null, waitingReason: 'NO_SPENDING_APPROVER' });
      } finally {
        await h.setRole('SPENDING_APPROVER', boss);
      }
    });

    it('treats a head who has left the company as no head, so the fallback approver holds the step', async () => {
      const leaving = await h.departmentWithUnit('P-LEAVE');
      const leaver = await h.staff(leaving, 'LV-H3');
      const colleague = await h.staff(leaving, 'LV-E5');
      await h.makeHead(leaving, leaver);
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [leaver.employeeId]);

      const sent = await h.sent(colleague, internalPlan);

      expect(sent.needStep).toMatchObject({ routingRow: 4, assignee: { employeeId: fallback.employeeId } });
    });

    it('never gives the step to someone who only administers, and one person holds it (AC-10, AC-11)', async () => {
      const admins = [h.it1, h.finance];
      for (const account of admins) {
        const wire = h.dataOf<{ request: { needStep: { assignee: { employeeId: string } | null } } }>(
          await h.submit(h.form(internalPlan), account).expect(201),
        );
        expect(wire.request.needStep.assignee?.employeeId).not.toBe(account.employeeId);
        expect([head.employeeId, boss.employeeId, fallback.employeeId]).toContain(
          wire.request.needStep.assignee?.employeeId ?? '',
        );
      }
    });
  });

  describe('the policy fixed when the request is sent (US-05-02)', () => {
    it('gives paid software already in the catalog a spend step and internal software none, whatever the seats left (AC-9)', async () => {
      const internal = await h.sent(designer, internalPlan);
      const paid = await h.sent(designer, paidPlan);

      expect(internal).toMatchObject({ branch: 'INTERNAL_FREE', policy: { hasSpendStep: false } });
      expect(paid).toMatchObject({ branch: 'PAID_IN_CATALOG', policy: { hasSpendStep: true } });
    });

    it('flags the same person holding the need step and the spend step only when there is a spend step (AC-9)', async () => {
      // A head's request goes to the spending approver for the need (row 2), who also holds the spend step.
      const paid = await h.sent(head, paidPlan);
      const internal = await h.sent(head, internalPlan);

      expect(paid.needStep).toMatchObject({ assignee: { employeeId: boss.employeeId }, samePersonAsSpend: true });
      expect(internal.needStep).toMatchObject({ assignee: { employeeId: boss.employeeId }, samePersonAsSpend: false });
    });

    it('keeps the SLA of a request sent before the parameter changed, and gives a later request the new one (AC-3)', async () => {
      await h.setParameter('APPROVAL_SLA_WORKING_DAYS', 3).expect(200);
      const before = await h.sent(designer, internalPlan);
      await h.setParameter('APPROVAL_SLA_WORKING_DAYS', 5).expect(200);
      const after = await h.sent(designer, internalPlan);
      const reread = h.dataOf<{ request: typeof before }>(
        await h.fetch(before.id, designer.account).expect(200),
      ).request;

      expect(before.needStep.slaWorkingDays).toBe(3);
      expect(reread.needStep.slaWorkingDays).toBe(3);
      expect(reread.policy).toEqual(before.policy);
      expect(after.needStep.slaWorkingDays).toBe(5);
    });

    it('does not depend on the channel the request comes from (AC-10)', async () => {
      const web = await h.sent(designer, paidPlan);
      const response = await h
        .submit(h.form(paidPlan), designer.account)
        .set('User-Agent', 'SaaSSentryMobile/1.0')
        .expect(201);
      const mobile = h.dataOf<{ request: typeof web }>(response).request;

      expect(mobile.policy).toEqual(web.policy);
      expect(mobile.needStep.routingRow).toBe(web.needStep.routingRow);
      expect(mobile.needStep.assignee).toEqual(web.needStep.assignee);
    });
  });

  describe('the form BM-01 (US-05-02 AC-6, US-01-12 AC-1)', () => {
    const rows = async () => ({
      requests: await h.requestRows(),
      events: (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM audit_events WHERE action LIKE 'ACCESS_REQUEST.%'`,
        )
      ).rows[0].n,
    });

    it.each([
      ['a reason left blank', { businessReason: '   ' }],
      ['no reason', { businessReason: undefined }],
      ['no term', { termMonths: undefined }],
      ['a term of zero months', { termMonths: 0 }],
      ['a term nobody asks for', { termMonths: 121 }],
      ['a branch chosen by the sender', { branch: 'INTERNAL_FREE' }],
      ['a Cost Center chosen by the sender', { costCenterId: randomUUID() }],
    ])('refuses %s and writes nothing: no request, no step, no audit event', async (_name, patch) => {
      const before = await rows();

      const response = await h.submit({ ...h.form(internalPlan), ...patch }, designer.account).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await rows()).toEqual(before);
    });

    it('names the field that is missing (US-01-12 AC-1)', async () => {
      const response = await h
        .submit({ planId: internalPlan, businessReason: '', termMonths: undefined }, designer.account)
        .expect(422);

      const paths = (h.detailsOf(response).issues as { path: string }[]).map((issue) => issue.path).sort();

      expect(paths).toEqual(['businessReason', 'termMonths']);
    });

    it('does not create the need step of a request that is refused (AC-1)', async () => {
      const steps = await h.count('access_request_steps');

      await h.submit({ ...h.form(internalPlan), businessReason: '' }, designer.account).expect(422);

      expect(await h.count('access_request_steps')).toBe(steps);
    });
  });

  describe('who may read a request', () => {
    it('lets the sender, the holder of the step and an IT Admin read it, and nobody else', async () => {
      const sent = await h.sent(designer, internalPlan);

      await h.fetch(sent.id, designer.account).expect(200);
      await h.fetch(sent.id, head.account).expect(200);
      await h.fetch(sent.id, h.it1).expect(200);
      for (const stranger of [h.employee, h.finance, boss.account]) {
        expect(h.codeOf(await h.fetch(sent.id, stranger).expect(404))).toBe('ACCESS_REQUEST.NOT_FOUND');
      }
      const superAdmin = { ...h.employee, accessToken: h.admin };
      expect(h.codeOf(await h.fetch(sent.id, superAdmin).expect(404))).toBe('ACCESS_REQUEST.NOT_FOUND');
    });

    it('answers a request that does not exist like one the caller has no part in, and refuses a bad id and no token', async () => {
      expect(h.codeOf(await h.fetch(randomUUID(), designer.account).expect(404))).toBe('ACCESS_REQUEST.NOT_FOUND');
      expect(h.codeOf(await h.fetch('not-an-id', designer.account).expect(422))).toBe('VALIDATION_ERROR');
      await request(h.server()).get(`/api/v1/access-requests/${randomUUID()}`).expect(401);
      await request(h.server()).post('/api/v1/access-requests').send(h.form(internalPlan)).expect(401);
    });
  });

  describe('what cannot be asked for', () => {
    it('refuses a plan that does not exist', async () => {
      const response = await h.submit(h.form(randomUUID()), designer.account).expect(404);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.PLAN_NOT_FOUND');
    });

    it('refuses a plan of an application that has left the catalog', async () => {
      const retired = await h.plan('K5');
      await h.ctx.sql.query(
        `UPDATE applications SET catalog_status = 'RETIRED', retired_at = now()
          WHERE id = (SELECT application_id FROM plans WHERE id = $1)`,
        [retired],
      );

      expect(h.codeOf(await h.submit(h.form(retired), designer.account).expect(409))).toBe(
        'ACCESS_REQUEST.APPLICATION_RETIRED',
      );
    });

    it('refuses a sender who belongs to no department', async () => {
      const lonely = await h.staff(headless, 'HR-E7');
      await h.ctx.sql.query(`DELETE FROM employee_placements WHERE employee_id = $1`, [lonely.employeeId]);

      expect(h.codeOf(await h.submit(h.form(internalPlan), lonely.account).expect(409))).toBe(
        'ACCESS_REQUEST.NO_DEPARTMENT',
      );
    });
  });

  describe('the audit trail of routing (AC-12)', () => {
    it('records who was given the step, the row, the department and its head on the day of sending', async () => {
      const sent = await h.sent(designer, internalPlan);

      const submitted = await h.auditEvents('ACCESS_REQUEST', sent.id);
      const routed = await h.auditEvents('ACCESS_REQUEST_STEP', sent.needStep.id);

      expect(submitted.map((event) => event.action)).toEqual(['ACCESS_REQUEST.SUBMITTED']);
      expect(routed).toHaveLength(1);
      expect(routed[0].action).toBe('ACCESS_REQUEST.NEED_STEP_ROUTED');
      expect(routed[0].after).toMatchObject({
        requestId: sent.id,
        routingRow: 1,
        outcome: 'ASSIGNED',
        assigneeEmployeeId: head.employeeId,
        role: 'MANAGER',
        departmentId: design.id,
        departmentHeadEmployeeId: head.employeeId,
        requesterEmployeeId: designer.employeeId,
      });
      expect(routed[0].actor_app_user_id).toBe(designer.account.appUserId);
    });

    it('records a waiting step with the reason and nobody assigned', async () => {
      const sent = await h.sent(fallback, internalPlan);

      const [routed] = await h.auditEvents('ACCESS_REQUEST_STEP', sent.needStep.id);

      expect(routed.after).toMatchObject({
        outcome: 'WAITING',
        routingRow: 8,
        assigneeEmployeeId: null,
        waitingReason: 'FALLBACK_IS_REQUESTER',
      });
    });
  });

  describe('all or nothing', () => {
    it('leaves no request, step or audit event when the second audit event cannot be written', async () => {
      const audit = h.ctx.app.get(AuditApi);
      const record = audit.record.bind(audit);
      let calls = 0;
      jest.spyOn(audit, 'record').mockImplementation((tx, event) => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('audit down'));

        return record(tx, event);
      });
      const before = {
        requests: await h.requestRows(),
        steps: await h.count('access_request_steps'),
        beneficiaries: await h.count('access_request_beneficiaries'),
      };

      await h.submit(h.form(internalPlan), designer.account).expect(500);

      expect({
        requests: await h.requestRows(),
        steps: await h.count('access_request_steps'),
        beneficiaries: await h.count('access_request_beneficiaries'),
      }).toEqual(before);
    });
  });
});
