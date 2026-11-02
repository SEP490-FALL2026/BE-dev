import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApprovalRoleChangeListeners } from '../../../src/modules/identity-access/public/identity-access.extension-points';
import { OrganizationChangeListeners } from '../../../src/modules/organization/public/organization.extension-points';
import { StepReassignmentService } from '../../../src/modules/requests/reassignment/step-reassignment.service';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { ReassignmentHarness } from '../../support/reassignment-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';
import { ensureManagerGrant } from '../../support/builders/account.builder';

const h = new ReassignmentHarness();
const M = 1_000_000;
const APPROVE = { decision: 'APPROVE' };

describe('who holds a step when the organization or a role changes, over PostgreSQL (US-05-12)', () => {
  let internal: string;
  let paid: string;
  let subscriptionId: string;
  let fallback: Person;
  let counter = 0;
  let failOrganizationListener = false;
  let failRoleListener = false;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    internal = await h.plan('K5');
    subscriptionId = await h.subscription(20);
    paid = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    fallback = await h.staff(await h.departmentWithUnit('P-FBK'), 'FBK-R0');
    await h.setRole('FALLBACK_APPROVER', fallback);
    // Two listeners that fail on demand, registered after the one of the requests: a change that one of them refuses is rolled back with what the first wrote.
    h.ctx.app
      .get(OrganizationChangeListeners, { strict: false })
      .add('test.refuses-on-demand', () =>
        failOrganizationListener ? Promise.reject(new Error('listener refused')) : Promise.resolve(),
      );
    h.ctx.app
      .get(ApprovalRoleChangeListeners, { strict: false })
      .add('test.refuses-on-demand', () =>
        failRoleListener ? Promise.reject(new Error('listener refused')) : Promise.resolve(),
      );
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a head and a member. */
  const scene = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-X${counter}`);
  };
  const person = async (unit: Unit, label: string): Promise<Person> => {
    counter += 1;

    return h.staff(unit.department, `${label}-${counter}`);
  };
  const auditCount = async () =>
    Number(
      (
        await h.ctx.sql.query<{ count: string }>(
          `SELECT count(*) FROM audit_events WHERE action IN ('ACCESS_REQUEST.STEP_REDETERMINED',
             'ACCESS_REQUEST.STEP_WAITING', 'ACCESS_REQUEST.STEP_ASSIGNED_FROM_WAIT', 'ACCESS_REQUEST.STEP_WAIT_ALERTED')`,
        )
      ).rows[0].count,
    );
  const allSteps = async () =>
    (await h.ctx.sql.query(`SELECT * FROM access_request_steps ORDER BY id`)).rows as unknown[];
  const headOf = async (departmentId: string) =>
    (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT employee_id FROM department_head_periods WHERE department_id = $1 AND valid_to IS NULL`,
        [departmentId],
      )
    ).rows[0]?.employee_id ?? null;

  describe('the department of the requester changes (AC-1, AC-6, AC-9)', () => {
    it('gives the need step to the head of the new department, with the deadline where it was and the chain untouched', async () => {
      const from = await scene();
      const to = await scene();
      const sent = await h.sent(from.member, internal);
      const before = await h.stepOf(sent.id, 'NEED');
      const requestBefore = await h.requestRow(sent.id);
      expect(before.assignee_employee_id).toBe(from.head.employeeId);

      await h.moveTo(from.member.employeeId, to.department.id);

      const after = await h.stepOf(sent.id, 'NEED');
      expect(after).toMatchObject({ state: 'PENDING', assignee_employee_id: to.head.employeeId, routing_row: 1 });
      expect(after.created_at).toEqual(before.created_at);
      expect((after.assigned_at as Date).getTime()).toBeGreaterThan((before.assigned_at as Date).getTime());
      // The branch, the chain, the department and the state of the request stay as they were sent.
      expect(await h.requestRow(sent.id)).toEqual(requestBefore);
      const [event] = await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', after.id);
      expect(event).toMatchObject({
        actor_kind: 'SYSTEM',
        before: { assigneeEmployeeId: from.head.employeeId },
        after: {
          requestId: sent.id,
          stepKind: 'NEED',
          trigger: 'DEPARTMENT_CHANGED',
          assigneeEmployeeId: to.head.employeeId,
          stepCreatedAt: before.created_at.toISOString(),
        },
      });
      expect(event.after.source).toBe(event.correlation_id);
      // The one who held it no longer sees it to decide it; the new head can.
      expect(h.codeOf(await h.decide(sent.id, APPROVE, from.head.account).expect(404))).toBe(
        'ACCESS_REQUEST.NOT_FOUND',
      );
      await h.decide(sent.id, APPROVE, to.head.account).expect(200);
    });

    it('moves nothing when only the job title changes (US-03-01 AC-11)', async () => {
      const unit = await scene();
      const sent = await h.sent(unit.member, internal);
      const before = await h.stepOf(sent.id, 'NEED');
      const events = await auditCount();

      await h.emit({
        kind: 'PLACEMENT_START',
        placementId: randomUUID(),
        employeeId: unit.member.employeeId,
        fromDepartmentId: unit.department.id,
        toDepartmentId: unit.department.id,
        effectiveOn: h.today(),
      });

      expect(await h.stepOf(sent.id, 'NEED')).toEqual(before);
      expect(await auditCount()).toBe(events);
    });

    it('waits for the day a change takes effect: a move dated tomorrow changes nothing today, the pass of the day picks it up when it arrives', async () => {
      const from = await scene();
      const to = await scene();
      const sent = await h.sent(from.member, internal);
      const member = from.member.employeeId;
      await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = valid_from - 30 WHERE employee_id = $1`, [
        member,
      ]);
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL`,
        [member, h.tomorrow()],
      );
      await h.ctx.sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         SELECT gen_random_uuid(), organization_id, employee_id, $2, $3
           FROM employee_placements WHERE employee_id = $1 AND valid_to = $3`,
        [member, to.department.id, h.tomorrow()],
      );

      await h.sweep();
      expect((await h.stepOf(sent.id, 'NEED')).assignee_employee_id).toBe(from.head.employeeId);

      // The day arrives: the placement of the old department ends today and the new one begins today, and nobody announced it.
      await h.ctx.sql.query(`UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to = $3`, [
        member,
        h.today(),
        h.tomorrow(),
      ]);
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_from = $2 WHERE employee_id = $1 AND valid_from = $3`,
        [member, h.today(), h.tomorrow()],
      );
      await h.sweep();

      const step = await h.stepOf(sent.id, 'NEED');
      expect(step.assignee_employee_id).toBe(to.head.employeeId);
      expect((await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', step.id))[0].after).toMatchObject({
        trigger: 'EFFECTIVE_DATE_REACHED',
      });
    });

    it('touches neither a need step already approved, nor the spend step that follows, nor the task of the grant (AC-7, AC-9)', async () => {
      const unit = await scene();
      const other = await scene();
      const colleague = await person(unit, 'AC7');
      await h.budgetFor(unit, { total: 100 * M });
      const waiting = await h.waitingForApprover(unit, paid, { amount: 5 * M });
      const granted = await h.waitingForApprover({ ...unit, member: colleague }, paid, { amount: 5 * M });
      await h.decideSpend(granted, APPROVE, h.boss.account).expect(200);
      await h.grant({ requestId: granted, subscriptionId }).expect(201);
      const needBefore = await h.stepOf(waiting, 'NEED');
      const spendBefore = await h.stepOf(waiting, 'SPEND_APPROVAL');
      expect(spendBefore).toMatchObject({ state: 'PENDING', assignee_employee_id: h.boss.employeeId });
      const taskOf = async () =>
        JSON.stringify(
          (await h.ctx.sql.query(`SELECT * FROM provisioning_tasks WHERE request_id = $1`, [granted])).rows,
        );
      const task = await taskOf();
      expect(task).not.toBe('[]');
      const decided = await allSteps();
      const events = await auditCount();

      // The requester of the first request moves, and so does the one whose grant has its task.
      await h.moveTo(unit.member.employeeId, other.department.id);
      await h.moveTo(colleague.employeeId, other.department.id);

      expect(await h.stepOf(waiting, 'NEED')).toEqual(needBefore);
      expect(await h.stepOf(waiting, 'SPEND_APPROVAL')).toEqual(spendBefore);
      expect(await allSteps()).toEqual(decided);
      expect(await taskOf()).toBe(task);
      expect(await auditCount()).toBe(events);
    });
  });

  describe('the head of a department changes (AC-2)', () => {
    it('gives the need steps of the department to the new head, those held by the head who goes and those held by the fallback, and no other department', async () => {
      const des = await scene();
      const other = await scene();
      counter += 1;
      const opsDepartment = await h.departmentWithUnit(`P-OPS${counter}`);
      const opsMember = await h.staff(opsDepartment, `OPS-E${counter}`);
      const opsNew = await h.staff(opsDepartment, `OPS-N${counter}`);
      const h3 = await person(des, 'DES-H3');
      const underHead = await h.sent(des.member, internal);
      const underFallback = await h.sent(opsMember, internal);
      const elsewhere = await h.sent(other.member, internal);
      expect((await h.stepOf(underFallback.id, 'NEED')).assignee_employee_id).toBe(fallback.employeeId);
      const created = (await h.stepOf(underHead.id, 'NEED')).created_at;
      const elsewhereBefore = await h.stepOf(elsewhere.id, 'NEED');

      await h.makeHead(des.department, h3);
      await h.makeHead(opsDepartment, opsNew);

      const moved = await h.stepOf(underHead.id, 'NEED');
      expect(moved).toMatchObject({ assignee_employee_id: h3.employeeId, routing_row: 1 });
      expect(moved.created_at).toEqual(created);
      expect(await h.stepOf(underFallback.id, 'NEED')).toMatchObject({ assignee_employee_id: opsNew.employeeId });
      expect(await h.stepOf(elsewhere.id, 'NEED')).toEqual(elsewhereBefore);
      expect((await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', moved.id))[0].after).toMatchObject({
        trigger: 'HEAD_CHANGED',
        assigneeEmployeeId: h3.employeeId,
      });
    });

    it('gives the need step to the fallback approver when the head goes and nobody follows', async () => {
      const unit = await scene();
      const sent = await h.sent(unit.member, internal);

      await h.vacateHead(unit.department.id).expect(200);

      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: fallback.employeeId,
        routing_row: 4,
      });
    });
  });

  describe('a holder leaves the company (AC-3)', () => {
    it('gives the need step to the fallback approver, then to the head who is named, with the deadline unchanged', async () => {
      const unit = await scene();
      const successor = await person(unit, 'LV-N');
      const sent = await h.sent(unit.member, internal);
      const created = (await h.stepOf(sent.id, 'NEED')).created_at;

      await h.leave(unit.head.employeeId);
      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: fallback.employeeId,
        routing_row: 4,
      });

      await h.makeHead(unit.department, successor);
      const step = await h.stepOf(sent.id, 'NEED');
      expect(step).toMatchObject({ assignee_employee_id: successor.employeeId, routing_row: 1 });
      expect(step.created_at).toEqual(created);
      expect((await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', step.id)).map((row) => row.after.trigger)).toEqual([
        'HOLDER_LEFT',
        'HEAD_CHANGED',
      ]);
    });

    it('makes the review of Finance wait when its holder leaves and nobody else holds the role, and gives it back when somebody does', async () => {
      const unit = await scene();
      await h.budgetFor(unit, { total: 100 * M, held: 20 * M, spent: 40 * M });
      counter += 1;
      const departed = await h.staff(await h.departmentWithUnit(`P-FIN${counter}`), `FIN-D${counter}`);
      const next = await h.staff(await h.departmentWithUnit(`P-FIN${counter + 100}`), `FIN-N${counter}`);
      await h.revokeRoleFrom(h.finance.appUserId, 'FINANCE').expect(200);
      await h.grantRoleTo(departed.account.appUserId, 'FINANCE').expect(201);
      const id = await h.paidRequest(unit, paid, { amount: 45 * M });
      await h.route(id, unit.head.account);
      expect(await h.stepOf(id, 'FINANCE_REVIEW')).toMatchObject({ assignee_employee_id: departed.employeeId });

      try {
        await h.revokeRoleFrom(departed.account.appUserId, 'FINANCE').expect(200);
        await h.leave(departed.employeeId);
        expect(await h.stepOf(id, 'FINANCE_REVIEW')).toMatchObject({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'NO_FINANCE_REVIEWER',
        });
        expect(await h.state(id)).toBe('WAITING_CONTROLLED');

        await h.grantRoleTo(next.account.appUserId, 'FINANCE').expect(201);
        expect(await h.stepOf(id, 'FINANCE_REVIEW')).toMatchObject({
          state: 'PENDING',
          assignee_employee_id: next.employeeId,
          waiting_reason: null,
          waiting_since: null,
        });
        expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
      } finally {
        await h.revokeRoleFrom(next.account.appUserId, 'FINANCE');
        await h.grantRoleTo(h.finance.appUserId, 'FINANCE');
      }
    });

    it('makes the assessment of the IT Admin wait when the IT Admin in charge leaves, and gives it to the one named after', async () => {
      const unit = await scene();
      const inCharge = await h.staff(unit.department, `IT-A${(counter += 1)}`, ['IT_ADMIN']);
      const successor = await h.staff(unit.department, `IT-B${counter}`, ['IT_ADMIN']);
      await h.setItAdminInCharge(unit.department, inCharge);
      const proposed = await h.proposed(unit.member);
      await h.decide(proposed.id, APPROVE, unit.head.account).expect(200);
      const created = (await h.stepOf(proposed.id, 'IT_ASSESSMENT')).created_at;
      expect(await h.stepOf(proposed.id, 'IT_ASSESSMENT')).toMatchObject({ assignee_employee_id: inCharge.employeeId });
      const stateBefore = (await h.requestRow(proposed.id)).state;

      await h.leave(inCharge.employeeId);
      expect(await h.stepOf(proposed.id, 'IT_ASSESSMENT')).toMatchObject({
        state: 'WAITING',
        waiting_reason: 'NO_IT_ADMIN_IN_CHARGE',
      });
      // The request is not moved by an assessment that waits (the state is that of the step before it).
      expect((await h.requestRow(proposed.id)).state).toBe(stateBefore);

      await h.setItAdminInCharge(unit.department, successor);
      await h.sweep();
      const step = await h.stepOf(proposed.id, 'IT_ASSESSMENT');
      expect(step).toMatchObject({ state: 'PENDING', assignee_employee_id: successor.employeeId, waiting_since: null });
      expect(step.created_at).toEqual(created);
    });
  });

  describe('an approval role changes hands (AC-4)', () => {
    it('gives the spend step and the need step the approver held to the new approver, and a request the new approver is party to goes to the substitute', async () => {
      const unit = await scene();
      await h.budgetFor(unit, { total: 100 * M });
      counter += 1;
      const c2 = await h.staff(await h.departmentWithUnit(`P-C2-${counter}`), `C2-${counter}`);
      const spend = await h.waitingForApprover(unit, paid, { amount: 5 * M });
      const party = await h.waitingForApprover(unit, paid, { amount: 5 * M });
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        party,
        c2.employeeId,
      ]);
      const own = await h.sent(unit.head, paid);
      expect(await h.stepOf(own.id, 'NEED')).toMatchObject({ assignee_employee_id: h.boss.employeeId, routing_row: 2 });
      const created = {
        spend: (await h.stepOf(spend, 'SPEND_APPROVAL')).created_at,
        own: (await h.stepOf(own.id, 'NEED')).created_at,
      };

      await h.setRole('SPENDING_APPROVER', c2);
      try {
        const movedSpend = await h.stepOf(spend, 'SPEND_APPROVAL');
        expect(movedSpend).toMatchObject({ state: 'PENDING', assignee_employee_id: c2.employeeId });
        expect(movedSpend.created_at).toEqual(created.spend);
        const movedOwn = await h.stepOf(own.id, 'NEED');
        expect(movedOwn).toMatchObject({ state: 'PENDING', assignee_employee_id: c2.employeeId, routing_row: 2 });
        expect(movedOwn.created_at).toEqual(created.own);
        expect(await h.stepOf(party, 'SPEND_APPROVAL')).toMatchObject({
          state: 'PENDING',
          assignee_employee_id: h.substitute.employeeId,
        });
        // The role is handed over in two steps (revoke, then grant): the step waits, then goes to the new approver (US-01-03 AC-3, AC-9).
        expect((await h.audit('ACCESS_REQUEST.STEP_WAITING', movedSpend.id))[0].after).toMatchObject({
          trigger: 'ROLE_HOLDER_CHANGED',
        });
        expect((await h.audit('ACCESS_REQUEST.STEP_ASSIGNED_FROM_WAIT', movedSpend.id))[0].after).toMatchObject({
          trigger: 'ROLE_HOLDER_CHANGED',
          assigneeEmployeeId: c2.employeeId,
        });
        // The approver who was is told no, the new one decides.
        expect(h.codeOf(await h.decideSpend(spend, APPROVE, h.boss.account).expect(403))).toBe(
          'SPEND.NOT_THE_ASSIGNEE',
        );
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
      expect(await h.stepOf(spend, 'SPEND_APPROVAL')).toMatchObject({ assignee_employee_id: h.boss.employeeId });
    });

    it('flags both steps when one person ends up holding the need step and the spend step, and clears it when they do not', async () => {
      // A head's own request goes to the spending approver for the need (row 2): the check ran when the approver approved it.
      const unit = await h.departmentWithHead(`P-C3-${(counter += 1)}`);
      await h.budgetFor(unit, { total: 100 * M });
      const c2 = await h.staff(await h.departmentWithUnit(`P-C3X-${counter}`), `C3-${counter}`);
      const sent = await h.sent(unit.head, paid, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
      await h.setPayments(sent.id, { amount: 5 * M });
      const id = sent.id;
      // One person holds the need step they approved and the spend step: both are flagged (US-05-03 AC-9).
      expect(await h.stepOf(id, 'NEED')).toMatchObject({ same_person_as_spend: true });
      expect(await h.stepOf(id, 'SPEND_APPROVAL')).toMatchObject({
        assignee_employee_id: h.boss.employeeId,
        same_person_as_spend: true,
      });

      await h.setRole('SPENDING_APPROVER', c2);
      try {
        expect(await h.stepOf(id, 'SPEND_APPROVAL')).toMatchObject({
          assignee_employee_id: c2.employeeId,
          same_person_as_spend: false,
        });
        expect(await h.stepOf(id, 'NEED')).toMatchObject({ same_person_as_spend: false });
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });
  });

  describe('what is never an event, and what repeats (AC-5)', () => {
    it('writes nothing when the data does not move, however often the sweep runs or the same change is heard', async () => {
      const unit = await scene();
      for (let index = 0; index < 5; index += 1) await h.sent(await person(unit, 'BL'), internal);
      const steps = await allSteps();
      const events = await auditCount();

      for (let pass = 0; pass < 3; pass += 1) await h.sweep();
      await h.emit({
        kind: 'HEAD_PERIOD_START',
        periodId: randomUUID(),
        departmentId: unit.department.id,
        headEmployeeId: unit.head.employeeId,
        previousHeadEmployeeId: null,
        effectiveOn: h.today(),
      });

      expect(await allSteps()).toEqual(steps);
      expect(await auditCount()).toBe(events);
    });

    it('does nothing the second time the same change is told: the table is run on the data of today', async () => {
      const unit = await scene();
      const to = await scene();
      const sent = await h.sent(unit.member, internal);
      await h.moveTo(unit.member.employeeId, to.department.id);
      const events = await auditCount();
      const step = await h.stepOf(sent.id, 'NEED');

      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const service = h.ctx.app.get(StepReassignmentService, { strict: false });
      const second = await runner.run((tx) =>
        service.reconcileRequests(
          tx,
          [sent.id],
          { kind: 'DEPARTMENT_CHANGED', employeeId: null },
          randomUUID(),
          new Date(),
        ),
      );

      expect(second).toMatchObject({ requests: 1, redetermined: 0, madeToWait: 0, assignedFromWait: 0, alerted: 0 });
      expect(await h.stepOf(sent.id, 'NEED')).toEqual(step);
      expect(await auditCount()).toBe(events);
    });
  });

  describe('the listeners are part of the change (contract)', () => {
    it('rolls the change back with what the listener of the requests wrote when another listener refuses it', async () => {
      const unit = await scene();
      const successor = await person(unit, 'RB-N');
      const sent = await h.sent(unit.member, internal);
      const before = await h.stepOf(sent.id, 'NEED');
      const events = await auditCount();

      failOrganizationListener = true;
      try {
        await ensureManagerGrant(h.ctx, h.admin, successor.employeeId);
        await request(h.server())
          .post(`/api/v1/departments/${unit.department.id}/head-assignments`)
          .set({ Authorization: `Bearer ${h.admin}` })
          .send({ employeeId: successor.employeeId, effectiveFrom: h.today() })
          .expect(500);
      } finally {
        failOrganizationListener = false;
      }

      expect(await headOf(unit.department.id)).toBe(unit.head.employeeId);
      expect(await h.stepOf(sent.id, 'NEED')).toEqual(before);
      expect(await auditCount()).toBe(events);
    });

    it('rolls the revoke of the spending approver role back when a listener of the roles refuses it', async () => {
      const unit = await scene();
      await h.budgetFor(unit, { total: 100 * M });
      const id = await h.waitingForApprover(unit, paid, { amount: 5 * M });
      const before = await h.stepOf(id, 'SPEND_APPROVAL');

      failRoleListener = true;
      try {
        // Taking the role from the approver is the change; the listener that refuses it takes the revoke back with it.
        await request(h.server())
          .delete(`/api/v1/app-users/${h.boss.account.appUserId}/role-grants/SPENDING_APPROVER`)
          .set({ Authorization: `Bearer ${h.admin}` })
          .expect(500);
      } finally {
        failRoleListener = false;
      }

      expect(await h.stepOf(id, 'SPEND_APPROVAL')).toEqual(before);
      expect((await h.getApprovalRoleHolder('SPENDING_APPROVER')) ?? null).toBe(h.boss.employeeId);
    });

    it('moves a step once when two changes reach the same request at the same time, without waiting in a circle', async () => {
      const unit = await scene();
      const to = await scene();
      const sent = await h.sent(unit.member, internal);
      await h.moveTo(unit.member.employeeId, to.department.id, { announce: false });
      const change = {
        kind: 'HEAD_PERIOD_START' as const,
        periodId: randomUUID(),
        departmentId: to.department.id,
        headEmployeeId: to.head.employeeId,
        previousHeadEmployeeId: null,
        effectiveOn: h.today(),
      };

      await Promise.all([h.emit(change), h.emit({ ...change, periodId: randomUUID() })]);

      const step = await h.stepOf(sent.id, 'NEED');
      expect(step.assignee_employee_id).toBe(to.head.employeeId);
      expect(await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', step.id)).toHaveLength(1);
    });

    it('lets a decision that finished first stand, and refuses the old holder once the step has moved', async () => {
      const unit = await scene();
      const to = await scene();
      const sent = await h.sent(unit.member, internal);

      const [decision] = await Promise.all([
        h.decide(sent.id, APPROVE, unit.head.account),
        h.moveTo(unit.member.employeeId, to.department.id),
      ]);

      const step = await h.stepOf(sent.id, 'NEED');
      if (decision.status === 200) {
        // The head decided first: the step is decided and is not taken from the one who decided it.
        expect(step).toMatchObject({ state: 'APPROVED', assignee_employee_id: unit.head.employeeId });
        expect(await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', step.id)).toHaveLength(0);
      } else {
        expect(decision.status).toBe(404);
        expect(step).toMatchObject({ state: 'PENDING', assignee_employee_id: to.head.employeeId });
      }
    });
  });
});
