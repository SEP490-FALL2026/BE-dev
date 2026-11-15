import { SpendRoutingService } from '../../../src/modules/requests/spend/spend-routing.service';
import type { Unit } from '../../support/spend-harness';
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

  /**
   * The head period of the department ends today and a successor is recorded to start tomorrow: the day in between has no head who can act
   * (a successor named for a later day does not hold the department today).
   */
  const recordSuccessorForTomorrow = async (unit: Unit, code: string) => {
    const next = await h.staff(unit.department, code);
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
    await h.ctx.sql.query(`UPDATE department_head_periods SET valid_to = $2 WHERE id = $1`, [endedPeriodId, h.today()]);
    const [{ id: successorPeriodId }] = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         SELECT gen_random_uuid(), organization_id, id, $2, $3 FROM departments WHERE id = $1 RETURNING id`,
        [unit.department.id, next.employeeId, h.tomorrow()],
      )
    ).rows;

    return { next, endedPeriodId, successorPeriodId };
  };

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
      const { next, endedPeriodId, successorPeriodId } = await recordSuccessorForTomorrow(unit, `XG-H${n}`);
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

  describe('free internal software when the department loses its head (D-78, QĐ-111bc)', () => {
    /** What a request of free internal software sent into a department that has no head looks like: the shape the reassignment must give. */
    const oneStepShape = {
      state: 'AWAITING_EXECUTION',
      routing: { mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' },
      needStep: { state: 'NOT_REQUIRED', assignee: null, routingRow: 4 },
    };

    it('goes straight to the IT Admin like one sent now, flagged and audited once, while a paid request of the same department keeps waiting', async () => {
      n += 1;
      const unit = await h.departmentWithHead(`P-XF${n}`);
      const free = await h.sent(unit.member, internal);
      const sentPaid = await h.sent(unit.member, paid);
      const before = await h.stepOf(free.id, 'NEED');
      expect(before).toMatchObject({ state: 'PENDING', assignee_employee_id: unit.head.employeeId });
      expect(await requestRow(free.id)).toEqual({ routing_mode: 'VIA_HEAD', one_step_reason: null, state: 'PENDING' });

      await h.vacateHead(unit.department.id).expect(200);

      expect(await h.stepOf(free.id, 'NEED')).toMatchObject({
        state: 'NOT_REQUIRED',
        assignee_employee_id: null,
        assigned_at: null,
        waiting_reason: null,
        waiting_since: null,
        routing_row: 4,
        created_at: before.created_at,
      });
      expect(await requestRow(free.id)).toEqual({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'NO_DEPARTMENT_HEAD',
        state: 'AWAITING_EXECUTION',
      });
      // The chain is the one a request sent now has: no need step in it.
      expect((await h.requestRow(free.id)).policy).toMatchObject({ chain: ['IT_EXECUTION'] });
      expect(await readBy(free.id, unit.member)).toMatchObject(oneStepShape);
      // The same answer the requester of a request sent into the department now reads.
      const newcomer = await h.staff(unit.department, `XF-E${n}`);
      expect(await h.sent(newcomer, internal)).toMatchObject(oneStepShape);

      const flagged = await h.audit('ACCESS_REQUEST.NO_NEED_APPROVER', free.id);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].after).toMatchObject({ routingMode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' });
      const ended = await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', before.id);
      expect(ended).toHaveLength(1);
      expect(ended[0]).toMatchObject({
        actor_kind: 'SYSTEM',
        before: { assigneeEmployeeId: unit.head.employeeId },
        after: { requestId: free.id, stepKind: 'NEED', oneStepReason: 'NO_DEPARTMENT_HEAD' },
      });

      // A paid request is not free: it still has a spend step, so it waits for the next head (QĐ-110i) and is the only one the notice counts.
      expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({
        state: 'WAITING',
        waiting_reason: 'NO_DEPARTMENT_HEAD',
      });
      expect(await requestRow(sentPaid.id)).toEqual({
        routing_mode: 'VIA_HEAD',
        one_step_reason: null,
        state: 'WAITING_CONTROLLED',
      });
      expect(await h.audit('ACCESS_REQUEST.NO_NEED_APPROVER', sentPaid.id)).toEqual([]);
      expect((await withoutHeadNotices(unit.department.id))[0].params).toMatchObject({ waitingCount: 1 });
    });

    it('is moved once: the passes of the worker that come after find nothing to move and write nothing', async () => {
      n += 1;
      const unit = await h.departmentWithHead(`P-XI${n}`);
      const free = await h.sent(unit.member, internal);
      const step = await h.stepOf(free.id, 'NEED');
      await h.vacateHead(unit.department.id).expect(200);
      const moved = await requestRow(free.id);
      expect(moved).toMatchObject({ routing_mode: 'ONE_STEP', state: 'AWAITING_EXECUTION' });

      const first = await h.sweep();
      const second = await h.sweep();

      expect([first.oneStepFinished, second.oneStepFinished]).toEqual([0, 0]);
      expect(await requestRow(free.id)).toEqual(moved);
      expect(await h.stepOf(free.id, 'NEED')).toMatchObject({ id: step.id, state: 'NOT_REQUIRED' });
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', step.id)).toHaveLength(1);
      expect(await h.audit('ACCESS_REQUEST.NO_NEED_APPROVER', free.id)).toHaveLength(1);
    });

    it('goes on waiting through the gap while a successor is recorded, and goes to that head the day the period starts, not to the IT Admin (QĐ-110h, B2A-R2)', async () => {
      n += 1;
      const unit = await h.departmentWithHead(`P-XJ${n}`);
      const free = await h.sent(unit.member, internal);
      const sentPaid = await h.sent(unit.member, paid);
      const before = await h.stepOf(free.id, 'NEED');
      const { next, endedPeriodId, successorPeriodId } = await recordSuccessorForTomorrow(unit, `XJ-H${n}`);

      await h.emit({
        kind: 'HEAD_PERIOD_END',
        periodId: endedPeriodId,
        departmentId: unit.department.id,
        headEmployeeId: unit.head.employeeId,
        effectiveOn: h.today(),
      });

      // The waiting of the work moves to the successor on the day the period starts (QĐ-110h): the request is not sent to the IT Admin, as the audit trail shows.
      expect(await h.stepOf(free.id, 'NEED')).toMatchObject({
        id: before.id,
        state: 'WAITING',
        assignee_employee_id: null,
        waiting_reason: 'NO_DEPARTMENT_HEAD',
        created_at: before.created_at,
      });
      expect(await requestRow(free.id)).toEqual({
        routing_mode: 'VIA_HEAD',
        one_step_reason: null,
        state: 'WAITING_CONTROLLED',
      });
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', before.id)).toEqual([]);
      expect(await h.audit('ACCESS_REQUEST.NO_NEED_APPROVER', free.id)).toEqual([]);
      expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({
        state: 'WAITING',
        waiting_reason: 'NO_DEPARTMENT_HEAD',
      });
      // Nothing the worker does in the gap moves it (a recorded successor is not a gap to put right).
      await h.sweep();
      expect(await h.stepOf(free.id, 'NEED')).toMatchObject({ state: 'WAITING', waiting_reason: 'NO_DEPARTMENT_HEAD' });
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', before.id)).toEqual([]);

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

      expect(await h.stepOf(free.id, 'NEED')).toMatchObject({
        id: before.id,
        state: 'PENDING',
        assignee_employee_id: next.employeeId,
        created_at: before.created_at,
      });
      expect(await requestRow(free.id)).toMatchObject({ routing_mode: 'VIA_HEAD', state: 'PENDING' });
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', before.id)).toEqual([]);
    });

    it('leaves the sending as it was: a request of free internal software sent into the gap goes in one step (B2A-R2 changes only what already waits)', async () => {
      n += 1;
      const unit = await h.departmentWithHead(`P-XK${n}`);
      const { endedPeriodId } = await recordSuccessorForTomorrow(unit, `XK-H${n}`);
      await h.emit({
        kind: 'HEAD_PERIOD_END',
        periodId: endedPeriodId,
        departmentId: unit.department.id,
        headEmployeeId: unit.head.employeeId,
        effectiveOn: h.today(),
      });

      const gapMember = await h.staff(unit.department, `XK-E${n}`);

      expect(await h.sent(gapMember, internal)).toMatchObject(oneStepShape);
    });

    it('also puts right a request that waited for a head under the rule before this one: the next pass of the worker sends it on', async () => {
      n += 1;
      const department = await h.departmentWithUnit(`P-XW${n}`);
      const member = await h.staff(department, `XW-E${n}`);
      const free = await h.sent(member, internal);
      // What the earlier rule left: the request sent through the head (so with a need step in its chain), waiting for one.
      await h.ctx.sql.query(
        `UPDATE access_requests SET routing_mode = 'VIA_HEAD', one_step_reason = NULL, state = 'WAITING_CONTROLLED',
                policy = jsonb_set(policy, '{chain}', '["NEED","IT_EXECUTION"]'::jsonb) WHERE id = $1`,
        [free.id],
      );
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'WAITING', waiting_reason = 'NO_DEPARTMENT_HEAD' WHERE request_id = $1 AND kind = 'NEED'`,
        [free.id],
      );
      const waiting = await h.stepOf(free.id, 'NEED');
      expect(waiting).toMatchObject({ state: 'WAITING', waiting_reason: 'NO_DEPARTMENT_HEAD' });

      await h.sweep();

      expect(await h.stepOf(free.id, 'NEED')).toMatchObject({
        id: waiting.id,
        state: 'NOT_REQUIRED',
        waiting_reason: null,
      });
      expect(await requestRow(free.id)).toEqual({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'NO_DEPARTMENT_HEAD',
        state: 'AWAITING_EXECUTION',
      });
      expect((await h.requestRow(free.id)).policy).toMatchObject({ chain: ['IT_EXECUTION'] });
      // The flag the pass wrote, besides the one the sending wrote before the test put the request back to the old shape.
      const flags = () => h.audit('ACCESS_REQUEST.NO_NEED_APPROVER', free.id);
      expect((await flags()).map((event) => event.actor_kind)).toEqual(['USER', 'SYSTEM']);
      await h.sweep();
      expect(await flags()).toHaveLength(2);
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', waiting.id)).toHaveLength(1);
    });
  });

  describe('a request the earlier rule turned into one-step before this one (data of an earlier deploy)', () => {
    it('is still finished by the sweep, one request at a time, a failure of one not holding back the others, and not finished twice', async () => {
      n += 1;
      const first = await h.departmentWithHead(`P-XL${n}`);
      n += 1;
      const second = await h.departmentWithHead(`P-XL${n}`);
      const failed = await h.sent(first.member, paid);
      const completed = await h.sent(second.member, paid);
      await h.markedOneStepByEarlierRule(failed.id);
      await h.markedOneStepByEarlierRule(completed.id);
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
