import { SpendRoutingService } from '../../../src/modules/requests/spend/spend-routing.service';
import { StatusHarness } from '../../support/status-harness';
import type { AccessRequestWire } from '../../support/request-harness';
import { changeRoleTo } from '../../support/builders/account.builder';

const h = new StatusHarness();

/**
 * MF1-X (`QĐ-110i`, `QĐ-111bc`, `R-43`): a department with no head never turns a paid request or a case B proposal into a one-step
 * request. They wait at the need step, whether they were sent into the gap or were waiting for a head who left, and go to the head
 * the day one starts, with the deadline where it was. Free internal software is the one request that goes in one step.
 */
describe('a department with no head: paid requests and case B wait for one, over PostgreSQL (MF1-X)', () => {
  let paid: string;
  let internal: string;
  let superAdminEmployeeId: string;
  let n = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    internal = await h.plan('K5');
    paid = await h.planOf(await h.subscription(50));
    superAdminEmployeeId = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].employee_id;
  }, 240000);

  afterAll(async () => h.stop());

  const requestRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ routing_mode: string; one_step_reason: string | null; state: string }>(
        `SELECT routing_mode::text, one_step_reason, state::text FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const withoutHeadNotices = async (departmentId: string) =>
    (await h.noticesOf(superAdminEmployeeId, 'DEPARTMENT_WITHOUT_HEAD')).filter(
      (row) => row.params.departmentId === departmentId,
    );
  /** The wire of a request as its requester reads it. */
  const readBy = async (id: string, person: { account: Parameters<StatusHarness['fetch']>[1] }) =>
    h.dataOf<{ request: AccessRequestWire }>(await h.fetch(id, person.account).expect(200)).request;

  describe('a request sent into a department that has no head (MF1-X.1)', () => {
    it('makes a paid request and a case B proposal wait at the need step; free internal software goes in one step and is flagged', async () => {
      n += 1;
      const department = await h.departmentWithUnit(`P-XS${n}`);
      const member = await h.staff(department, `XS-E${n}`);

      const sentPaid = await h.sent(member, paid);
      expect(sentPaid).toMatchObject({
        state: 'WAITING_CONTROLLED',
        routing: { mode: 'VIA_HEAD', oneStepReason: null },
        needStep: { state: 'WAITING', assignee: null, routingRow: 4, waitingReason: 'NO_DEPARTMENT_HEAD' },
      });

      const proposed = await h.proposed(member);
      expect(proposed).toMatchObject({
        state: 'WAITING_CONTROLLED',
        routing: { mode: 'VIA_HEAD', oneStepReason: null },
        needStep: { state: 'WAITING', assignee: null, waitingReason: 'NO_DEPARTMENT_HEAD' },
      });
      // R-43: not known yet whether it ends free or paid, so it does not reach the IT Admin before its need is decided.
      expect(await h.stepOf(proposed.id, 'IT_ASSESSMENT')).toBeUndefined();

      const free = await h.sent(member, internal);
      expect(free).toMatchObject({
        routing: { mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' },
        needStep: { state: 'NOT_REQUIRED', assignee: null, routingRow: 4 },
      });
      expect((await h.auditEvents('ACCESS_REQUEST', free.id)).map((event) => event.action)).toContain(
        'ACCESS_REQUEST.NO_NEED_APPROVER',
      );

      // The pass of the worker neither converts what waits nor finishes anything: the sweep is only a safety net.
      const pass = await h.sweep();
      expect(pass.oneStepFinished).toBe(0);
      expect(await requestRow(sentPaid.id)).toEqual({
        routing_mode: 'VIA_HEAD',
        one_step_reason: null,
        state: 'WAITING_CONTROLLED',
      });
      expect(await requestRow(proposed.id)).toMatchObject({ routing_mode: 'VIA_HEAD', state: 'WAITING_CONTROLLED' });
    });

    it('hands what waits to the head who starts, in the transaction that names them, without giving back the days it waited', async () => {
      n += 1;
      const department = await h.departmentWithUnit(`P-XT${n}`);
      const member = await h.staff(department, `XT-E${n}`);
      const nominee = await h.staff(department, `XT-H${n}`);
      const sentPaid = await h.sent(member, paid);
      const proposed = await h.proposed(member);
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET created_at = created_at - interval '3 days' WHERE request_id = ANY($1::uuid[])`,
        [[sentPaid.id, proposed.id]],
      );
      const waiting = await h.stepOf(sentPaid.id, 'NEED');
      const waitingProposal = await h.stepOf(proposed.id, 'NEED');

      await h.makeHead(department, nominee);

      expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: nominee.employeeId,
        waiting_reason: null,
        created_at: waiting.created_at,
      });
      expect(await h.stepOf(proposed.id, 'NEED')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: nominee.employeeId,
        created_at: waitingProposal.created_at,
      });
      expect(await h.state(sentPaid.id)).toBe('PENDING');
      expect(await h.state(proposed.id)).toBe('PENDING');
      expect((await readBy(sentPaid.id, member)).needStep.assignee?.employeeId).toBe(nominee.employeeId);
    });
  });

  describe('a head period ends (MF1-X.2)', () => {
    it('keeps a paid request that was with the head waiting for one: no one-step conversion, one audit trail, the Super Admin told once', async () => {
      n += 1;
      const unit = await h.departmentWithHead(`P-XE${n}`);
      const sent = await h.sent(unit.member, paid);
      const before = await h.stepOf(sent.id, 'NEED');
      expect(before).toMatchObject({ state: 'PENDING', assignee_employee_id: unit.head.employeeId });

      await h.vacateHead(unit.department.id).expect(200);

      const waiting = await h.stepOf(sent.id, 'NEED');
      expect(waiting).toMatchObject({
        state: 'WAITING',
        assignee_employee_id: null,
        waiting_reason: 'NO_DEPARTMENT_HEAD',
        created_at: before.created_at,
      });
      expect(await requestRow(sent.id)).toEqual({
        routing_mode: 'VIA_HEAD',
        one_step_reason: null,
        state: 'WAITING_CONTROLLED',
      });
      expect(await h.audit('ACCESS_REQUEST.CONVERTED_ONE_STEP', sent.id)).toEqual([]);

      const notices = await withoutHeadNotices(unit.department.id);
      expect(notices).toHaveLength(1);
      expect(notices[0].params).toMatchObject({ departmentId: unit.department.id, waitingCount: 1 });

      // Nothing the worker does later converts it, tells the Super Admin again, or gives the step to anyone.
      await h.sweep();
      await h.sweep();
      expect(await requestRow(sent.id)).toMatchObject({ routing_mode: 'VIA_HEAD', state: 'WAITING_CONTROLLED' });
      expect(await withoutHeadNotices(unit.department.id)).toHaveLength(1);
      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({ state: 'WAITING', assignee_employee_id: null });
    });

    it('does not tell the Super Admin while a head is recorded to follow, and hands the waiting steps over the day that head starts', async () => {
      n += 1;
      const unit = await h.departmentWithHead(`P-XG${n}`);
      const existing = await h.sent(unit.member, paid);
      const before = await h.stepOf(existing.id, 'NEED');
      const next = await h.staff(unit.department, `XG-H${n}`);
      await changeRoleTo(h.ctx, h.admin, next.employeeId, 'MANAGER');
      const [{ id: endedPeriodId }] = (
        await h.ctx.sql.query<{ id: string }>(`SELECT id FROM department_head_periods WHERE department_id = $1`, [
          unit.department.id,
        ])
      ).rows;
      // The head stays a member for the whole period (INV-20): the placement of the head moves back with the period.
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_from = valid_from - 1 WHERE department_id = $1 AND employee_id = $2`,
        [unit.department.id, unit.head.employeeId],
      );
      await h.ctx.sql.query(`UPDATE department_head_periods SET valid_from = valid_from - 1 WHERE id = $1`, [
        endedPeriodId,
      ]);
      await h.ctx.sql.query(`UPDATE department_head_periods SET valid_to = $2 WHERE id = $1`, [
        endedPeriodId,
        h.today(),
      ]);
      const [{ id: successorPeriodId }] = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
           SELECT gen_random_uuid(), organization_id, id, $2, $3 FROM departments WHERE id = $1 RETURNING id`,
          [unit.department.id, next.employeeId, h.tomorrow()],
        )
      ).rows;

      await h.emit({
        kind: 'HEAD_PERIOD_END',
        periodId: endedPeriodId,
        departmentId: unit.department.id,
        headEmployeeId: unit.head.employeeId,
        effectiveOn: h.today(),
      });

      expect(await h.stepOf(existing.id, 'NEED')).toMatchObject({
        state: 'WAITING',
        waiting_reason: 'NO_DEPARTMENT_HEAD',
      });
      expect(await requestRow(existing.id)).toMatchObject({ routing_mode: 'VIA_HEAD' });
      expect(await withoutHeadNotices(unit.department.id)).toEqual([]);
      // A request sent in the gap waits as well (QĐ-110i), where it used to go in one step (M-15).
      const newcomer = await h.staff(unit.department, `XG-E${n}`);
      const gap = await h.sent(newcomer, paid);
      expect(gap).toMatchObject({ state: 'WAITING_CONTROLLED', routing: { mode: 'VIA_HEAD' } });

      await h.ctx.sql.query(`UPDATE department_head_periods SET valid_from = $2 WHERE id = $1`, [
        successorPeriodId,
        h.today(),
      ]);
      await h.emit({
        kind: 'HEAD_PERIOD_START',
        periodId: successorPeriodId,
        departmentId: unit.department.id,
        headEmployeeId: next.employeeId,
        previousHeadEmployeeId: unit.head.employeeId,
        effectiveOn: h.today(),
      });

      expect(await h.stepOf(existing.id, 'NEED')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: next.employeeId,
        created_at: before.created_at,
      });
      expect(await h.stepOf(gap.id, 'NEED')).toMatchObject({ state: 'PENDING', assignee_employee_id: next.employeeId });
      expect(await withoutHeadNotices(unit.department.id)).toEqual([]);
    });
  });

  describe('a request the earlier rule turned into one-step before this one (data of an earlier deploy)', () => {
    /** What the earlier rule wrote when a head left: one-step, reason HEAD_LEFT, the need step closed and its lines confirmed. */
    const markedByEarlierRule = async (id: string) => {
      await h.ctx.sql.query(
        `UPDATE access_requests SET routing_mode = 'ONE_STEP', one_step_reason = 'HEAD_LEFT' WHERE id = $1`,
        [id],
      );
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'CLOSED', decided_at = now(), waiting_reason = NULL, waiting_since = NULL,
                same_person_as_spend = false, no_independent_review = false
          WHERE request_id = $1 AND kind = 'NEED' AND state IN ('PENDING', 'WAITING')`,
        [id],
      );
      await h.ctx.sql.query(`UPDATE access_request_lines SET state = 'NEED_CONFIRMED' WHERE request_id = $1`, [id]);
    };

    it('is still finished by the sweep, one request at a time, a failure of one not holding back the others, and not finished twice', async () => {
      n += 1;
      const first = await h.departmentWithHead(`P-XL${n}`);
      n += 1;
      const second = await h.departmentWithHead(`P-XL${n}`);
      const failed = await h.sent(first.member, paid);
      const completed = await h.sent(second.member, paid);
      await markedByEarlierRule(failed.id);
      await markedByEarlierRule(completed.id);
      const spending = h.ctx.app.get(SpendRoutingService, { strict: false });
      const finish = spending.finishConversion.bind(spending);
      let injected = false;
      const spy = jest.spyOn(spending, 'finishConversion').mockImplementation(async (tx, request, now) => {
        if (request.id === failed.id && !injected) {
          injected = true;
          throw new Error('injected conversion failure');
        }
        return finish(tx, request, now);
      });
      try {
        const pass = await h.sweep();
        expect(pass.failedRequests).toBe(1);
        expect(pass.oneStepFinished).toBe(1);
        expect(await requestRow(failed.id)).toMatchObject({ routing_mode: 'ONE_STEP', state: 'PENDING' });
        expect(await requestRow(completed.id)).toMatchObject({
          routing_mode: 'ONE_STEP',
          state: 'AWAITING_REQUESTER_REVISION',
        });
        expect((await h.sweep()).oneStepFinished).toBe(1);
        expect(await requestRow(failed.id)).toMatchObject({ state: 'AWAITING_REQUESTER_REVISION' });
        expect((await h.sweep()).oneStepFinished).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
