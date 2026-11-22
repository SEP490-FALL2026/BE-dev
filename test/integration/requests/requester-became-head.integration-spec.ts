import request from 'supertest';
import { changeRoleTo } from '../../support/builders/account.builder';
import { assignmentIdOf, importSeats } from '../../support/builders/seat.builder';
import { ReassignmentHarness } from '../../support/reassignment-harness';
import type { ApiAccount } from '../../support/api-accounts';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ReassignmentHarness();
const M = 1_000_000;

interface RequestMetaRow {
  type: string;
  routing_mode: string;
  one_step_reason: string | null;
  state: string;
}

describe('W1-17: when a requester becomes head, individual paid requests convert to one-step (integration, real PostgreSQL)', () => {
  let paid: string;
  let renewalSub: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(50));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    renewalSub = await h.subscription(50, 'K2');
    const renewalPlan = await h.planOf(renewalSub);
    await h
      .declareTaxProfile((await h.vendorOf(renewalPlan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (reserve = 0): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-RH${counter}`);
    await h.budgetFor(u, { total: 100 * M, reserve });

    return u;
  };

  const requestMeta = async (id: string): Promise<RequestMetaRow> =>
    (
      await h.ctx.sql.query<RequestMetaRow>(
        `SELECT type::text, routing_mode::text, one_step_reason, state::text FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];

  const inDays = (days: number): string => {
    const date = new Date(`${h.today()}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  };

  const seatOf = async (person: Person, subscriptionId: string, expectedEndDate: string): Promise<string> => {
    const { rows } = await h.ctx.sql.query<{ employee_code: string }>(
      `SELECT employee_code FROM employees WHERE id = $1`,
      [person.employeeId],
    );
    const code = rows[0].employee_code;
    await importSeats(
      h.ctx,
      h.it1.accessToken,
      { subscriptionId },
      h.file([
        {
          employee_code: code,
          account_identifier: `${code.toLowerCase()}@acme.vn`,
          granted_on: '2026-10-05',
          expected_end_date: expectedEndDate,
        },
      ]),
    );
    const found = await assignmentIdOf(h.ctx, { subscriptionId }, person.employeeId);
    if (!found) throw new Error(`missing seat for ${code}`);

    return found;
  };

  const resubmit = (id: string, account: ApiAccount) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/resubmission`).set(h.as(account));

  const renew = (assignmentId: string, account: ApiAccount) =>
    request(h.server())
      .post('/api/v1/access-requests/renewals')
      .set(h.as(account))
      .send({ assignmentId, extensionMonths: 3, businessReason: 'Still needed' });

  describe('(a) & (a′) individual paid request awaiting need step (PENDING or WAITING_CONTROLLED)', () => {
    it('(a) converts a PENDING paid request to ONE_STEP, opens SPEND_APPROVAL, records requesterBecameHead audit, and stays idempotent on sweep', async () => {
      const u = await unit();
      const approverId = await h.getSpendingApproverEmployeeId();
      const sent = await h.sent(u.member, paid, { termMonths: 1 });
      const needStep = await h.stepOf(sent.id, 'NEED');
      expect(needStep).toMatchObject({ state: 'PENDING', assignee_employee_id: u.head.employeeId });

      await h.makeHead(u.department, u.member);

      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({
        id: needStep.id,
        state: 'NOT_REQUIRED',
        assignee_employee_id: null,
        waiting_reason: null,
        routing_row: 2,
      });
      expect(await requestMeta(sent.id)).toEqual({
        type: 'GRANT',
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: approverId }),
      ]);
      const notRequired = await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', needStep.id);
      expect(notRequired).toHaveLength(1);
      expect(notRequired[0].after).toMatchObject({
        requestId: sent.id,
        stepKind: 'NEED',
        trigger: 'HEAD_CHANGED',
        oneStepReason: 'REQUESTER_IS_HEAD',
        requesterBecameHead: true,
      });
      expect(await h.audit('ACCESS_REQUEST.NO_NEED_APPROVER', sent.id)).toEqual([]);

      await h.sweep();
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toHaveLength(1);
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', needStep.id)).toHaveLength(1);
    });

    it('(a) converts when a pre-scheduled successor period starts today via HEAD_PERIOD_START', async () => {
      const u = await unit();
      const sent = await h.sent(u.member, paid, { termMonths: 1 });
      const needStep = await h.stepOf(sent.id, 'NEED');
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_from = valid_from - 2 WHERE department_id = $1 AND employee_id = $2`,
        [u.department.id, u.head.employeeId],
      );
      await h.ctx.sql.query(
        `UPDATE department_head_periods SET valid_from = valid_from - 2, valid_to = valid_from - 1 WHERE department_id = $1`,
        [u.department.id],
      );
      await changeRoleTo(h.ctx, h.admin, u.member.employeeId, 'MANAGER');
      const [{ id: periodId }] = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
           SELECT gen_random_uuid(), organization_id, id, $2, $3::date FROM departments WHERE id = $1 RETURNING id`,
          [u.department.id, u.member.employeeId, h.today()],
        )
      ).rows;

      await h.emit({
        kind: 'HEAD_PERIOD_START',
        departmentId: u.department.id,
        periodId,
        headEmployeeId: u.member.employeeId,
        previousHeadEmployeeId: u.head.employeeId,
        effectiveOn: h.today(),
      });

      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({ id: needStep.id, state: 'NOT_REQUIRED' });
      expect(await requestMeta(sent.id)).toMatchObject({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      const successorAudit = await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', needStep.id);
      expect(successorAudit).toHaveLength(1);
      expect(successorAudit[0].after).toMatchObject({
        requesterBecameHead: true,
        oneStepReason: 'REQUESTER_IS_HEAD',
      });
    });

    it('(a′) converts a WAITING_CONTROLLED (NO_DEPARTMENT_HEAD) paid request when its requester becomes head', async () => {
      const u = await unit();
      await h.vacateHead(u.department.id).expect(200);
      const sent = await h.sent(u.member, paid, { termMonths: 1 });
      const waiting = await h.stepOf(sent.id, 'NEED');
      expect(await h.state(sent.id)).toBe('WAITING_CONTROLLED');
      expect(waiting).toMatchObject({ state: 'WAITING', waiting_reason: 'NO_DEPARTMENT_HEAD' });

      await h.makeHead(u.department, u.member);

      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({
        id: waiting.id,
        state: 'NOT_REQUIRED',
        waiting_reason: null,
      });
      expect(await requestMeta(sent.id)).toMatchObject({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toHaveLength(1);
      const waitingAudit = await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', waiting.id);
      expect(waitingAudit).toHaveLength(1);
      expect(waitingAudit[0].after).toMatchObject({
        requesterBecameHead: true,
        oneStepReason: 'REQUESTER_IS_HEAD',
      });
      expect(await h.audit('ACCESS_REQUEST.NO_NEED_APPROVER', sent.id)).toEqual([]);
    });
  });

  describe('(b) & (c) individual paid request queued in AWAITING_SPEND_SUBMISSION', () => {
    it('(b) leaves AWAITING_SPEND_SUBMISSION, marks ONE_STEP REQUESTER_IS_HEAD, and opens SPEND_APPROVAL', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, paid, { amount: 10 * M });
      const needStep = await h.stepOf(id, 'NEED');
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');

      await h.makeHead(u.department, u.member);

      expect(await requestMeta(id)).toMatchObject({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      expect(await h.stepOf(id, 'NEED')).toMatchObject({ id: needStep.id, state: 'APPROVED' });
      expect(await h.steps(id, 'SPEND_APPROVAL')).toHaveLength(1);
      const queuedAudit = await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', needStep.id);
      expect(queuedAudit).toHaveLength(1);
      expect(queuedAudit[0].after).toMatchObject({
        requesterBecameHead: true,
        oneStepReason: 'REQUESTER_IS_HEAD',
      });
    });

    it('(c) moves a request waiting on reserve confirmation straight to SPEND_APPROVAL where approver sees reserve use and approves', async () => {
      const u = await unit(20 * M);
      const id = await h.paidRequest(u, paid, { amount: 110 * M });
      const sentOn = await h.sendOn([id], u.head.account).expect(201);
      expect(h.dataOf<{ results: Array<{ outcome: string }> }>(sentOn).results[0].outcome).toBe(
        'AWAITING_RESERVE_CONFIRMATION',
      );
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);

      await h.makeHead(u.department, u.member);

      expect(await requestMeta(id)).toMatchObject({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      expect(await h.steps(id, 'SPEND_APPROVAL')).toHaveLength(1);
      const { rows: checks } = await h.ctx.sql.query<{ outcome: string }>(
        `SELECT outcome::text FROM request_budget_checks WHERE request_id = $1 ORDER BY number DESC LIMIT 1`,
        [id],
      );
      expect(checks[0]?.outcome).toBe('USES_RESERVE');
      const { rows: confirmations } = await h.ctx.sql.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM request_reserve_confirmations WHERE request_id = $1`,
        [id],
      );
      expect(Number(confirmations[0].count)).toBe(0);

      await h.decideSpend(id, { decision: 'APPROVE' }, h.deciderOf()).expect(200);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
    });
  });

  describe('(f) already awaiting spend decision & (g) awaiting requester revision', () => {
    it('(f) keeps an existing AWAITING_SPEND_DECISION step unchanged and creates no duplicate spend step', async () => {
      const u = await unit();
      const id = await h.waitingForApprover(u, paid, { amount: 10 * M });
      const spendBefore = await h.stepOf(id, 'SPEND_APPROVAL');

      await h.makeHead(u.department, u.member);

      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toHaveLength(1);
      expect((await h.stepOf(id, 'SPEND_APPROVAL')).id).toBe(spendBefore.id);
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', (await h.stepOf(id, 'NEED')).id)).toEqual([]);
    });

    it('(g) leaves AWAITING_REQUESTER_REVISION untouched at head change, then converts via routeNeedStep on resubmission', async () => {
      const u = await unit();
      const sent = await h.sent(u.member, paid, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'RETURN', reason: 'Clarify scope' }, u.head.account).expect(200);
      expect(await h.state(sent.id)).toBe('AWAITING_REQUESTER_REVISION');

      await h.makeHead(u.department, u.member);

      expect(await requestMeta(sent.id)).toMatchObject({
        routing_mode: 'VIA_HEAD',
        state: 'AWAITING_REQUESTER_REVISION',
      });
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([]);

      await resubmit(sent.id, u.member.account).expect(200);

      expect(await requestMeta(sent.id)).toMatchObject({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toHaveLength(1);
      const resubmitAudit = await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', sent.id);
      expect(resubmitAudit).toHaveLength(1);
      expect(resubmitAudit[0].after).toMatchObject({
        requesterBecameHead: true,
        oneStepReason: 'REQUESTER_IS_HEAD',
      });
    });
  });

  describe('(h) paid renewal request follows the same conversion rules by its open state', () => {
    it('(h) converts an open RENEWAL in PENDING and one in AWAITING_SPEND_SUBMISSION to ONE_STEP -> AWAITING_SPEND_DECISION', async () => {
      const uPending = await unit();
      const seatPending = await seatOf(uPending.member, renewalSub, inDays(10));
      const pendingRenewal = h.dataOf<{ request: { id: string } }>(
        await renew(seatPending, uPending.member.account).expect(201),
      ).request;
      const pendingNeed = await h.stepOf(pendingRenewal.id, 'NEED');

      const uQueued = await unit();
      const seatQueued = await seatOf(uQueued.member, renewalSub, inDays(10));
      const queuedRenewal = h.dataOf<{ request: { id: string } }>(
        await renew(seatQueued, uQueued.member.account).expect(201),
      ).request;
      const queuedNeed = await h.stepOf(queuedRenewal.id, 'NEED');
      await h.decide(queuedRenewal.id, { decision: 'APPROVE' }, uQueued.head.account).expect(200);
      expect(await h.state(queuedRenewal.id)).toBe('AWAITING_SPEND_SUBMISSION');

      await h.makeHead(uPending.department, uPending.member);
      await h.makeHead(uQueued.department, uQueued.member);

      expect(await requestMeta(pendingRenewal.id)).toEqual({
        type: 'RENEWAL',
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      expect(await h.stepOf(pendingRenewal.id, 'NEED')).toMatchObject({ id: pendingNeed.id, state: 'NOT_REQUIRED' });
      expect(await h.steps(pendingRenewal.id, 'SPEND_APPROVAL')).toHaveLength(1);
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', pendingNeed.id)).toHaveLength(1);

      expect(await requestMeta(queuedRenewal.id)).toEqual({
        type: 'RENEWAL',
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      expect(await h.steps(queuedRenewal.id, 'SPEND_APPROVAL')).toHaveLength(1);
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', queuedNeed.id)).toHaveLength(1);
    });
  });
});
