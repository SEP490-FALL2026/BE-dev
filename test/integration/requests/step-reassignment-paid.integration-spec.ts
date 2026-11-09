import { ReassignmentHarness } from '../../support/reassignment-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';
import { changeRoleTo } from '../../support/builders/account.builder';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.3 (F28, `QĐ-90b`, `FR-3.16`): the event of a department that changes only
 * redetermines the need step of a request for internal software with no fee. A paid request keeps the department it was sent from, so
 * its need step stays with the head of that department, and a change of that head moves it by `access_requests.department_id`, not by
 * who sits in the department now.
 */
const h = new ReassignmentHarness();
const APPROVE = { decision: 'APPROVE' };

describe('a transfer redetermines the need step of internal requests only (F28)', () => {
  let internal: string;
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    internal = await h.plan('K5');
    paid = await h.planOf(await h.subscription(20));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const scene = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-PD${counter}`);
  };
  const colleague = async (unit: Unit, label: string): Promise<Person> => {
    counter += 1;

    return h.staff(unit.department, `${label}-${counter}`);
  };

  it('keeps a paid request with the head of the department it was sent from when the requester moves, and sends an internal one to the new head', async () => {
    const from = await scene();
    const to = await scene();
    const sentPaid = await h.sent(from.member, paid);
    const sentInternal = await h.sent(await colleague(from, 'IN'), internal);

    await h.moveTo(from.member.employeeId, to.department.id);
    await h.moveTo(sentInternal.requester.employeeId, to.department.id);

    // The paid request keeps its department and its head; nothing was redetermined for it.
    expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({
      state: 'PENDING',
      assignee_employee_id: from.head.employeeId,
    });
    expect(await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', (await h.stepOf(sentPaid.id, 'NEED')).id)).toEqual([]);
    expect((await h.requestRow(sentPaid.id)).department_id).toBe(from.department.id);
    // The internal request follows its requester to the new department (FR-3.16).
    expect(await h.stepOf(sentInternal.id, 'NEED')).toMatchObject({ assignee_employee_id: to.head.employeeId });
    // The old head still decides the paid one; the new head does not see it.
    expect(h.codeOf(await h.decide(sentPaid.id, APPROVE, to.head.account).expect(404))).toBe(
      'ACCESS_REQUEST.NOT_FOUND',
    );
    await h.decide(sentPaid.id, APPROVE, from.head.account).expect(200);
  });

  it('keeps a proposal of new software with the department it was sent from as well', async () => {
    const from = await scene();
    const to = await scene();
    const proposed = await h.proposed(from.member);

    await h.moveTo(from.member.employeeId, to.department.id);

    expect(await h.stepOf(proposed.id, 'NEED')).toMatchObject({ assignee_employee_id: from.head.employeeId });
  });

  it('gives the paid request of a person who moved to the new head of the department it was sent from, and not to the head of where they sit now', async () => {
    const from = await scene();
    const to = await scene();
    const sentPaid = await h.sent(from.member, paid);
    await h.moveTo(from.member.employeeId, to.department.id);
    const successor = await colleague(from, 'SUC');

    await h.makeHead(from.department, successor);

    expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({
      state: 'PENDING',
      assignee_employee_id: successor.employeeId,
    });
    await h.decide(sentPaid.id, APPROVE, successor.account).expect(200);
  });

  it('BR-MF1-02 converts a paid request in two phases when its original department loses its head, without following its requester', async () => {
    const from = await scene();
    const to = await scene();
    const sentPaid = await h.sent(from.member, paid);
    await h.moveTo(from.member.employeeId, to.department.id);

    const before = await h.stepOf(sentPaid.id, 'NEED');
    await h.vacateHead(from.department.id).expect(200);

    expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({ state: 'CLOSED', created_at: before.created_at });
    expect(
      await h.ctx.sql.query('SELECT 1 FROM request_budget_checks WHERE request_id = $1', [sentPaid.id]),
    ).toMatchObject({ rowCount: 0 });
    await h.sweep();
    expect(await h.state(sentPaid.id)).toBe('AWAITING_REQUESTER_REVISION');
    const stored = await h.ctx.sql.query<{ routing_mode: string; one_step_reason: string; department_id: string }>(
      'SELECT routing_mode::text, one_step_reason, department_id FROM access_requests WHERE id = $1',
      [sentPaid.id],
    );
    expect(stored.rows).toEqual([
      { routing_mode: 'ONE_STEP', one_step_reason: 'HEAD_LEFT', department_id: from.department.id },
    ]);
    expect(await h.stepOf(sentPaid.id, 'SPEND_APPROVAL')).toBeUndefined();
  });

  it('BR-MF1-02 M-15: a new request in a successor gap is one-step while an existing request waits for the recorded successor', async () => {
    const from = await scene();
    const existing = await h.sent(from.member, paid);
    const next = await colleague(from, 'GAP-H');
    await changeRoleTo(h.ctx, h.admin, next.employeeId, 'MANAGER');
    // The head stays a member for the whole period (INV-20): the placement of the head moves back with the period.
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_from = valid_from - 1
        WHERE department_id = $1 AND employee_id IN (SELECT employee_id FROM department_head_periods WHERE department_id = $1)`,
      [from.department.id],
    );
    await h.ctx.sql.query('UPDATE department_head_periods SET valid_from = valid_from - 1 WHERE department_id = $1', [
      from.department.id,
    ]);
    await h.ctx.sql.query('UPDATE department_head_periods SET valid_to = $2 WHERE department_id = $1', [
      from.department.id,
      h.today(),
    ]);
    const period = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       SELECT gen_random_uuid(), organization_id, id, $2, $3 FROM departments WHERE id = $1 RETURNING id`,
      [from.department.id, next.employeeId, h.tomorrow()],
    );
    await h.sweep();
    const waiting = await h.stepOf(existing.id, 'NEED');
    expect(waiting).toMatchObject({
      state: 'WAITING',
      assignee_employee_id: null,
      waiting_reason: 'NO_DEPARTMENT_HEAD',
    });

    const newcomer = await colleague(from, 'GAP-E');
    const sent = await h.sent(newcomer, paid);
    expect(sent).toMatchObject({
      state: 'AWAITING_REQUESTER_REVISION',
      routing: { mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' },
      needStep: { state: 'NOT_REQUIRED' },
    });
    await h.ctx.sql.query('UPDATE department_head_periods SET valid_from = $2 WHERE id = $1', [
      period.rows[0].id,
      h.today(),
    ]);
    await h.sweep();
    expect(await h.stepOf(existing.id, 'NEED')).toMatchObject({
      state: 'PENDING',
      assignee_employee_id: next.employeeId,
      created_at: waiting.created_at,
    });
    expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({ state: 'NOT_REQUIRED', assignee_employee_id: null });
    expect(await h.state(sent.id)).toBe('AWAITING_REQUESTER_REVISION');
  });

  it('leaves a paid request whose requester was transferred and whose pass of the day runs later with the department it was sent from', async () => {
    const from = await scene();
    const to = await scene();
    const sentPaid = await h.sent(from.member, paid);
    await h.moveTo(from.member.employeeId, to.department.id, { announce: false });

    await h.sweep();

    expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({ assignee_employee_id: from.head.employeeId });
  });

  describe('the spend step across a change of the spending approver (US-01-03 AC-3, US-05-11 AC-10, QĐ-93k(2))', () => {
    const M = 1_000_000;

    /** A paid request whose spend step the spending approver holds, and the person who will hold the role next. */
    const withSpendStep = async () => {
      const unit = await scene();
      await h.budgetFor(unit, { total: 100 * M });
      counter += 1;
      const next = await h.staff(await h.departmentWithUnit(`P-NX${counter}`), `NX-${counter}`);
      const id = await h.waitingForApprover(unit, paid, { amount: 5 * M });

      return { unit, id, next };
    };

    it('moves the pending spend step of a revoked or transferred spending approver as before', async () => {
      const { id, next } = await withSpendStep();
      const original = await h.stepOf(id, 'SPEND_APPROVAL');
      expect(original).toMatchObject({ state: 'PENDING', assignee_employee_id: h.boss.employeeId });
      counter += 1;
      const third = await h.staff(await h.departmentWithUnit(`P-TH${counter}`), `TH-${counter}`);

      try {
        // Revoked and not given to anybody: the step of the one who held the role waits (never frozen), with its age.
        await h.clearRole('SPENDING_APPROVER');
        const waiting = await h.stepOf(id, 'SPEND_APPROVAL');
        expect(waiting).toMatchObject({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'NO_SPENDING_APPROVER',
        });
        expect(waiting.created_at).toEqual(original.created_at);

        // Given to a new spending approver: the step goes to them, who decide it — never a 409.
        await h.setRole('SPENDING_APPROVER', next);
        expect(await h.stepOf(id, 'SPEND_APPROVAL')).toMatchObject({
          state: 'PENDING',
          assignee_employee_id: next.employeeId,
          created_at: original.created_at,
        });
        // Transferred again, in one move: the step follows the role.
        await h.setRole('SPENDING_APPROVER', third);
        expect(await h.stepOf(id, 'SPEND_APPROVAL')).toMatchObject({
          state: 'PENDING',
          assignee_employee_id: third.employeeId,
        });
        expect(h.codeOf(await h.decideSpend(id, APPROVE, next.account).expect(403))).toBe('SPEND.NOT_THE_ASSIGNEE');
        await h.decideSpend(id, APPROVE, third.account).expect(200);
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });

    it('treats a spend step held by somebody who never held the role like any other: no freeze, so it follows its holder who leaves', async () => {
      const { id } = await withSpendStep();
      counter += 1;
      const substitute = await h.staff(await h.departmentWithUnit(`P-SB${counter}`), `SB-${counter}`);
      // A step of the rule before QĐ-93 (the migration of the removal refuses a database that still has one): the substitute for a
      // conflict of interest holds it and never held the role. It is moved like every step: nothing keeps it still.
      const step = await h.stepOf(id, 'SPEND_APPROVAL');
      await h.ctx.sql.query(`UPDATE access_request_steps SET assignee_employee_id = $2 WHERE id = $1`, [
        step.id,
        substitute.employeeId,
      ]);

      await h.leave(substitute.employeeId);
      await h.sweep();

      expect(await h.stepOf(id, 'SPEND_APPROVAL')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: h.boss.employeeId,
        created_at: step.created_at,
      });
      expect(await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', step.id)).toHaveLength(1);
      await h.decideSpend(id, APPROVE, h.boss.account).expect(200);
    });
  });
});
