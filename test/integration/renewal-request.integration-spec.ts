import { randomUUID } from 'node:crypto';
import { LicensingService } from '../../src/modules/licensing/licensing.service';
import { ReturnHarness, type RenewalWire } from '../support/return-harness';
import type { Unit } from '../support/spend-harness';

const h = new ReturnHarness();
const M = 1_000_000;
const REASON = 'The work goes on';

describe('the renewal of a right that ends on a day over PostgreSQL (US-05-14)', () => {
  let paid: { subscriptionId: string; planId: string };
  let internalPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const subscriptionId = await h.subscription(20, 'K2');
    paid = { subscriptionId, planId: await h.planOf(subscriptionId) };
    internalPlan = await h.plan('K5');
    await h
      .declareTaxProfile((await h.vendorOf(paid.planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a head and a member who holds a right of the target that ends `endsIn` days from today. */
  const holder = async (
    target: { subscriptionId?: string; planId?: string },
    endsIn: number | null,
    since?: string,
  ) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-RN${counter}`);
    await h.budgetFor(unit, { total: 100 * M, held: 20 * M, spent: 40 * M });
    const end = endsIn === null ? undefined : h.inDays(endsIn);
    const assignmentId = await h.seatOf(unit.member, target, {
      ...(end ? { expectedEndDate: end } : {}),
      ...(since ? { grantedOn: since } : {}),
    });

    return { unit, assignmentId, end };
  };
  const body = (assignmentId: string, newExpectedEndDate: string, extra: object = {}) => ({
    assignmentId,
    newExpectedEndDate,
    businessReason: REASON,
    ...extra,
  });
  const approve = (id: string, unit: Unit) => h.decide(id, { decision: 'APPROVE' }, unit.head.account);
  /** The head chooses to take a paid renewal outside the plan, and the approver decides it. */
  const approvePaid = async (id: string, unit: Unit, amount = 5 * M) => {
    await h.decide(id, { decision: 'APPROVE', spend: { offPlan: true } }, unit.head.account).expect(200);
    await h.setPayments(id, { amount });
    await h.sendOn([id], unit.head.account).expect(201);
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);
  };
  const seatsOn = async (subscriptionId: string, day: string) =>
    (
      await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM license_assignments
          WHERE subscription_id = $1 AND valid_from <= $2::date AND (valid_until IS NULL OR valid_until > $2::date)`,
        [subscriptionId, day],
      )
    ).rows[0].n;
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ state: string; amount_minor: string; released_minor: string }>(
        `SELECT state::text, amount_minor::text, released_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows;
  const holds = (assignmentId: string) => h.ctx.app.get(LicensingService).hasPendingRenewal(assignmentId);

  describe('a request of its own, which approval turns into the record that follows (AC-1)', () => {
    it('renews a right of internal software: the old record keeps its end, a new one begins there and nobody is waited for', async () => {
      const { unit, assignmentId, end } = await holder({ planId: internalPlan }, 5);
      const newEnd = h.inDays(95);
      const tasksBefore = await h.count('provisioning_tasks');

      const { outcome, request } = await h.renewed(unit.member.account, body(assignmentId, newEnd));

      expect(outcome).toBe('RENEWAL_REQUESTED');
      expect(request).toMatchObject({
        type: 'RENEWAL',
        branch: 'INTERNAL_FREE',
        state: 'PENDING',
        expectedEndDate: newEnd,
        beneficiary: { employeeId: unit.member.employeeId },
        requester: { employeeId: unit.member.employeeId },
        plan: { planId: internalPlan },
        renewal: { assignmentId, previousExpectedEndDate: end, newExpectedEndDate: newEnd, applied: null },
      });
      expect(request.needStep.assignee?.employeeId).toBe(unit.head.employeeId);
      // The right is left as it is while the request is decided.
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: end });
      expect(await holds(assignmentId)).toBe(true);

      await approve(request.id, unit).expect(200);

      const old = await h.seatRow(assignmentId);
      expect(old).toMatchObject({ valid_until: end, expected_end_date: end });
      const [next] = await h.successorsOf(assignmentId);
      expect(next).toMatchObject({
        source: 'REQUEST',
        employee_id: unit.member.employeeId,
        predecessor_id: assignmentId,
        valid_from: end,
        valid_until: null,
        expected_end_date: newEnd,
      });
      const done = h.dataOf<{ request: RenewalWire }>(
        await h.fetch(request.id, unit.member.account).expect(200),
      ).request;
      expect(done.state).toBe('COMPLETED');
      expect(done.renewal?.applied?.successorAssignmentId).toBe(next.id);
      expect((await h.renewalOf(request.id)).successor_assignment_id).toBe(next.id);
      expect(await h.count('provisioning_tasks')).toBe(tasksBefore);
      expect(await holds(assignmentId)).toBe(false);
      // The record that renews the right is never granted by the IT Admin.
      expect(h.codeOf(await h.grant({ requestId: request.id }).expect(409))).toBe('PROVISIONING.REQUEST_ENDED');
      const applied = (await h.eventsOf('ACCESS_REQUEST.RENEWAL_APPLIED', request.id))[0];
      expect(applied.after).toMatchObject({ successorAssignmentId: next.id, previousEndsOn: end });
      expect(JSON.stringify(applied.after)).not.toContain('@acme.vn');
    });

    it('renews a paid right through the spend step, holds the cost for the new term and keeps the seats of every day', async () => {
      const { unit, assignmentId, end } = await holder(paid, 5);
      const newEnd = h.inDays(95);
      const freeBefore = await h.freeSeats(paid.subscriptionId);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, newEnd));
      expect(request).toMatchObject({ branch: 'PAID_IN_CATALOG', termMonths: 3 });

      await approvePaid(request.id, unit);

      expect(await h.state(request.id)).toBe('COMPLETED');
      expect(await commitmentOf(request.id)).toEqual([
        { state: 'HELD', amount_minor: String(5 * M), released_minor: '0' },
      ]);
      const [next] = await h.successorsOf(assignmentId);
      expect(next).toMatchObject({ valid_from: end, expected_end_date: newEnd, predecessor_id: assignmentId });
      expect((await h.seatRow(assignmentId)).valid_until).toBe(end);
      // The two records meet on the day the first ends: the seats taken do not change on any day.
      for (const day of [h.today(), h.inDays(4), end ?? '', h.inDays(6), newEnd]) {
        expect(await seatsOn(paid.subscriptionId, day)).toBe(await seatsOn(paid.subscriptionId, h.today()));
      }
      expect(await h.freeSeats(paid.subscriptionId)).toBe(freeBefore);
      const ended = (await h.auditEvents('LicenseAssignment', assignmentId)).find(
        (event) => event.action === 'LICENSE_ASSIGNMENT.ENDED',
      );
      expect(ended?.after).toMatchObject({ validUntil: end, reason: 'RENEWED', successorId: next.id });
      expect(
        (await h.auditEvents('LicenseAssignment', next.id)).find(
          (event) => event.action === 'LICENSE_ASSIGNMENT.CREATED',
        )?.after,
      ).toMatchObject({ predecessorId: assignmentId, requestId: request.id });
    });

    it('ends the old record today when the decision comes after the day the right was to end, and never leaves a period empty', async () => {
      const licensing = h.ctx.app.get(LicensingService);
      const { TransactionRunner } = await import('../../src/infrastructure/database/transaction-runner');
      const runner = h.ctx.app.get(TransactionRunner);
      const late = await holder({ planId: internalPlan }, 2);
      const sameDay = await holder({ planId: internalPlan }, 0, h.today());
      const renew = (assignmentId: string, previous: string, newEnd: string, now: Date) =>
        runner.run((tx) =>
          licensing.renewAssignment(tx, h.principal(h.it1, ['IT_ADMIN']), {
            assignmentId,
            requestId: randomUUID(),
            previousExpectedEndDate: previous,
            newExpectedEndDate: newEnd,
            now,
          }),
        );

      // Five days on, when the right was to end in two: the old record ends today, not in the past.
      const fiveDaysOn = new Date(`${h.inDays(5)}T05:00:00.000Z`);
      const renewedLate = await renew(late.assignmentId, late.end ?? '', h.inDays(95), fiveDaysOn);
      expect(renewedLate.endsOn).toBe(h.inDays(5));
      expect((await h.seatRow(late.assignmentId)).valid_until).toBe(h.inDays(5));
      expect((await h.successorsOf(late.assignmentId))[0]).toMatchObject({ valid_from: h.inDays(5) });

      // A seat that began today and was to end today still runs a day: its period is never empty.
      const renewedSameDay = await renew(sameDay.assignmentId, sameDay.end ?? '', h.inDays(60), new Date());
      expect(renewedSameDay.endsOn).toBe(h.inDays(1));
      expect(await h.seatRow(sameDay.assignmentId)).toMatchObject({ valid_from: h.today(), valid_until: h.inDays(1) });
    });
  });

  describe('a stay over twelve months in all (AC-3)', () => {
    it('asks for the confirmation by the months the records run on without a break, not by the term of the renewal', async () => {
      const { unit, assignmentId } = await holder({ planId: internalPlan }, 5, '2026-10-05');
      const first = await h.renewed(unit.member.account, body(assignmentId, '2027-04-30'));
      await approve(first.request.id, unit).expect(200);
      const [current] = await h.successorsOf(assignmentId);
      expect(first.request.renewal?.consecutiveMonths).toBe(7);

      // 2027-04-30 to 2027-12-31 is eight months, but the right would have run fifteen without a break.
      const second = await h.renewed(unit.member.account, body(current.id, '2027-12-31'));
      expect(second.request).toMatchObject({ termMonths: 8, renewal: { consecutiveMonths: 15 } });

      const refused = await approve(second.request.id, unit).expect(422);
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.TERM_CONFIRMATION_REQUIRED');
      expect(await h.state(second.request.id)).toBe('PENDING');

      await h
        .decide(
          second.request.id,
          { decision: 'APPROVE', termConfirmation: { reason: 'The project runs a long cycle' } },
          unit.head.account,
        )
        .expect(200);
      expect(await h.state(second.request.id)).toBe('COMPLETED');
      expect((await h.successorsOf(current.id))[0]).toMatchObject({
        valid_from: '2027-04-30',
        expected_end_date: '2027-12-31',
      });
    });

    it('asks for nothing when the right would run eleven months in all, and adds no step', async () => {
      const { unit, assignmentId } = await holder({ planId: internalPlan }, 5, '2026-10-05');

      const { request } = await h.renewed(unit.member.account, body(assignmentId, '2027-08-31'));

      expect(request.renewal?.consecutiveMonths).toBe(11);
      await approve(request.id, unit).expect(200);
      expect(await h.state(request.id)).toBe('COMPLETED');
      expect((await h.steps(request.id, 'NEED')).length).toBe(1);
    });
  });

  describe('a request sent before the end that is not decided leaves the right as it is (AC-4)', () => {
    it('holds the right while the request waits, and lets it go when the request is refused', async () => {
      const { unit, assignmentId, end } = await holder({ planId: internalPlan }, 0);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, h.inDays(60)));

      expect(await holds(assignmentId)).toBe(true);
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: end });

      await h.decide(request.id, { decision: 'REJECT', reason: 'No longer needed' }, unit.head.account).expect(200);

      expect(await holds(assignmentId)).toBe(false);
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: end });
      expect(await h.successorsOf(assignmentId)).toEqual([]);
    });

    it('lets the right go when the request is withdrawn, and a new request may follow', async () => {
      const { unit, assignmentId } = await holder({ planId: internalPlan }, 3);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, h.inDays(60)));
      expect(await holds(assignmentId)).toBe(true);

      await h.withdrawRequest(request.id, {}, unit.member.account).expect(200);

      expect(await holds(assignmentId)).toBe(false);
      await h.renewed(unit.member.account, body(assignmentId, h.inDays(70)));
      expect(await holds(assignmentId)).toBe(true);
    });
  });

  describe('a request sent after the end is a new request (AC-5)', () => {
    it('makes a request for the tool like any other, which the seat the person still holds does not stop', async () => {
      const { unit, assignmentId, end } = await holder({ planId: internalPlan }, -2);
      const newEnd = h.inDays(60);
      // Without the tolerance the seat the person still holds would refuse any request for the tool.
      const plain = await h.submit(h.form(internalPlan, { termMonths: 2 }), unit.member.account);
      expect(h.codeOf(plain)).toBe('ACCESS_REQUEST.ALREADY_HOLDS_ACCESS');

      const { outcome, request } = await h.renewed(unit.member.account, body(assignmentId, newEnd));

      expect(outcome).toBe('NEW_REQUEST');
      expect(request).toMatchObject({
        type: 'GRANT',
        state: 'PENDING',
        termMonths: 2,
        expectedEndDate: newEnd,
        renewal: null,
        plan: { planId: internalPlan },
      });
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: end });
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM access_request_renewals WHERE assignment_id = $1`, [assignmentId]))
          .rowCount,
      ).toBe(0);
      expect((await h.eventsOf('ACCESS_REQUEST.RENEWAL_REDIRECTED', request.id))[0].after).toMatchObject({
        assignmentId,
        previousExpectedEndDate: end,
        newExpectedEndDate: newEnd,
      });
      expect(await holds(assignmentId)).toBe(false);
    });

    it('leaves the request for a person whose right ended to that person: the head does not send it through this route', async () => {
      const { unit, assignmentId } = await holder({ planId: internalPlan }, -2);
      const before = await h.requestRows();

      const refused = await h.renew(body(assignmentId, h.inDays(60)), unit.head.account).expect(409);

      expect(h.codeOf(refused)).toBe('RENEWAL_REQUEST.END_PASSED');
      expect(await h.requestRows()).toBe(before);
    });
  });

  describe('who may ask, and for which right (US-05-14 AC-1)', () => {
    it('lets the head of the department ask for the person: the need step is confirmed by sending', async () => {
      const { unit, assignmentId, end } = await holder({ planId: internalPlan }, 5);

      const { request } = await h.renewed(unit.head.account, body(assignmentId, h.inDays(95)));

      // Nobody is left to decide a right that costs nothing: it was confirmed by the head and applied at once.
      expect(request).toMatchObject({
        type: 'RENEWAL',
        state: 'COMPLETED',
        requester: { employeeId: unit.head.employeeId },
        beneficiary: { employeeId: unit.member.employeeId },
        needDecision: { decision: 'APPROVED', deciderRole: 'MANAGER', decidedBy: { employeeId: unit.head.employeeId } },
        needStep: { routingRow: 5, state: 'APPROVED' },
      });
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: end, expected_end_date: end });
      expect(await h.successorsOf(assignmentId)).toHaveLength(1);
    });

    it('lets the head ask for a paid right, which then waits for the head to send it on', async () => {
      const { unit, assignmentId } = await holder(paid, 5);

      const { request } = await h.renewed(unit.head.account, body(assignmentId, h.inDays(95)));

      expect(request).toMatchObject({ state: 'AWAITING_SPEND_SUBMISSION', needStep: { state: 'APPROVED' } });
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null });
      // The need was confirmed by sending: the head who sent it does not decide it again, whatever they hold.
      await h.decide(request.id, { decision: 'APPROVE' }, unit.head.account).expect(403);
    });

    it('refuses a person who is not the holder and the head of another department, and writes nothing', async () => {
      const { unit, assignmentId } = await holder({ planId: internalPlan }, 5);
      const other = await h.departmentWithHead(`P-RN-X${(counter += 1)}`);
      const colleague = await h.staff(unit.department, `RN-C${counter}`);
      const before = [await h.requestRows(), await h.count('access_request_renewals')];

      const stranger = await h.renew(body(assignmentId, h.inDays(95)), colleague.account).expect(403);
      const foreignHead = await h.renew(body(assignmentId, h.inDays(95)), other.head.account).expect(403);
      const missing = await h.renew(body(randomUUID(), h.inDays(95)), unit.member.account).expect(404);

      expect(h.codeOf(stranger)).toBe('RENEWAL_REQUEST.NOT_HOLDER');
      expect(h.codeOf(foreignHead)).toBe('RENEWAL_REQUEST.OUTSIDE_DEPARTMENT');
      expect(h.codeOf(missing)).toBe('RENEWAL_REQUEST.ASSIGNMENT_NOT_FOUND');
      expect([await h.requestRows(), await h.count('access_request_renewals')]).toEqual(before);
    });

    it('refuses a right with no end date, one that another record follows, and a service account', async () => {
      const open = await holder({ planId: internalPlan }, null);
      const chained = await holder({ planId: internalPlan }, 5);
      const first = await h.renewed(chained.unit.member.account, body(chained.assignmentId, h.inDays(95)));
      await approve(first.request.id, chained.unit).expect(200);
      counter += 1;
      const service = await h.departmentWithHead(`P-RN${counter}`);
      const serviceSeat = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from,
           valid_from_basis, expected_end_date, created_by_app_user_id)
         VALUES ($1, $2, 'SERVICE', 'REQUEST', $3, $4, $5, 'ci-bot-9', 'ci-bot-9', 'CI', $6, $7, '2026-10-05', 'ACTUAL', $8, $9)`,
        [
          serviceSeat,
          h.seed.organizationId,
          paid.planId,
          paid.subscriptionId,
          service.member.employeeId,
          service.department.unitId,
          service.department.id,
          h.inDays(5),
          randomUUID(),
        ],
      );
      const before = await h.requestRows();

      const cases = [
        { assignmentId: open.assignmentId, account: open.unit.member.account, problem: 'NO_END_DATE' },
        { assignmentId: chained.assignmentId, account: chained.unit.member.account, problem: 'NOT_CURRENT' },
        { assignmentId: serviceSeat, account: service.member.account, problem: 'SERVICE_ACCOUNT' },
      ];
      for (const { assignmentId, account, problem } of cases) {
        const response = await h.renew(body(assignmentId, h.inDays(200)), account).expect(409);
        expect(h.codeOf(response)).toBe('RENEWAL_REQUEST.ASSIGNMENT_NOT_RENEWABLE');
        expect(h.detailsOf(response)).toEqual({ reason: problem });
      }

      expect(await h.requestRows()).toBe(before);
    });

    it('lets one of two requests that come at once win, and tells the other it is already asked', async () => {
      const { unit, assignmentId } = await holder({ planId: internalPlan }, 5);

      const [byHolder, again] = await Promise.all([
        h.renew(body(assignmentId, h.inDays(95)), unit.member.account),
        h.renew(body(assignmentId, h.inDays(96)), unit.member.account),
      ]);

      expect([byHolder.status, again.status].sort()).toEqual([201, 409]);
      expect(h.codeOf(byHolder.status === 409 ? byHolder : again)).toBe('RENEWAL_REQUEST.ALREADY_REQUESTED');
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM access_request_renewals WHERE assignment_id = $1`, [assignmentId]))
          .rowCount,
      ).toBe(1);
    });

    it('refuses an end that is not later, a term that is too long and a form that is not valid', async () => {
      const { unit, assignmentId, end } = await holder({ planId: internalPlan }, 5);
      const before = await h.requestRows();

      expect(h.codeOf(await h.renew(body(assignmentId, end ?? ''), unit.member.account).expect(422))).toBe(
        'RENEWAL_REQUEST.END_NOT_AFTER',
      );
      expect(h.codeOf(await h.renew(body(assignmentId, h.inDays(1)), unit.member.account).expect(422))).toBe(
        'RENEWAL_REQUEST.END_NOT_AFTER',
      );
      expect(h.codeOf(await h.renew(body(assignmentId, '2040-01-01'), unit.member.account).expect(422))).toBe(
        'RENEWAL_REQUEST.END_TOO_FAR',
      );
      for (const invalid of [
        { assignmentId, newExpectedEndDate: 'tomorrow', businessReason: REASON },
        { assignmentId, businessReason: REASON },
        { newExpectedEndDate: h.inDays(95), businessReason: REASON },
        { assignmentId, newExpectedEndDate: h.inDays(95), businessReason: '  ' },
        { assignmentId, newExpectedEndDate: h.inDays(95), businessReason: REASON, extra: 1 },
      ]) {
        expect(h.codeOf(await h.renew(invalid, unit.member.account).expect(422))).toBe('VALIDATION_ERROR');
      }
      expect(await h.requestRows()).toBe(before);
    });

    it('asks a head who sends for more than twelve months in all for the confirmation, as the one who decides would', async () => {
      const { unit, assignmentId } = await holder({ planId: internalPlan }, 5, '2026-10-05');

      const refused = await h.renew(body(assignmentId, '2027-12-31'), unit.head.account).expect(422);
      expect(h.codeOf(refused)).toBe('RENEWAL_REQUEST.TERM_CONFIRMATION_REQUIRED');

      const { request } = await h.renewed(
        unit.head.account,
        body(assignmentId, '2027-12-31', { termConfirmation: { reason: 'The project runs a long cycle' } }),
      );
      expect(request).toMatchObject({
        state: 'COMPLETED',
        needDecision: { termConfirmationReason: 'The project runs a long cycle' },
      });
    });
  });

  describe('a return and a renewal of one seat (US-05-13, US-05-14)', () => {
    it('refuses a renewal of a seat that is being returned, and a return of a seat whose renewal waits', async () => {
      const returning = await holder({ planId: internalPlan }, 5);
      const wire = await h.returned(returning.unit.member.account, {
        assignmentId: returning.assignmentId,
        reason: 'Done',
      });
      const waiting = await holder({ planId: internalPlan }, 5);
      await h.renewed(waiting.unit.member.account, body(waiting.assignmentId, h.inDays(95)));

      const renewal = await h
        .renew(body(returning.assignmentId, h.inDays(95)), returning.unit.member.account)
        .expect(409);
      const returned = await h
        .returnSeat({ assignmentId: waiting.assignmentId, reason: 'Done' }, waiting.unit.member.account)
        .expect(409);

      expect(h.codeOf(renewal)).toBe('RENEWAL_REQUEST.ASSIGNMENT_NOT_RENEWABLE');
      expect(h.detailsOf(renewal)).toEqual({ reason: 'REVOCATION_PENDING' });
      expect(h.codeOf(returned)).toBe('RETURN_REQUEST.RENEWAL_PENDING');
      expect((await h.returnRow(wire.id)).state).toBe('AWAITING_REVOCATION');
      // The refused return left nothing: the seat has no revocation, and the renewal still waits.
      expect(await h.liveTaskOf(waiting.assignmentId)).toBeNull();
      expect(await holds(waiting.assignmentId)).toBe(true);
    });
  });

  describe('a seat that can no longer be renewed when the approval comes (apply)', () => {
    /** A renewal of a seat of the subscription, sent, and the seat then taken away by a revocation of another source. */
    const revokedMeanwhile = async (complete: boolean) => {
      const { unit, assignmentId } = await holder(paid, 5);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, h.inDays(95)));
      await h.decide(request.id, { decision: 'APPROVE', spend: { offPlan: true } }, unit.head.account).expect(200);
      await h.setPayments(request.id, { amount: 5 * M });
      await h.sendOn([request.id], unit.head.account).expect(201);
      const { TransactionRunner } = await import('../../src/infrastructure/database/transaction-runner');
      const opened = await h.ctx.app
        .get(TransactionRunner)
        .run((tx) =>
          h.ctx.app
            .get(LicensingService)
            .openRevocation(
              tx,
              { ...h.principal(h.it1, ['IT_ADMIN']), roles: ['MANAGER'] },
              { assignmentId, source: 'GHOST_SEAT', decision: { decidedRole: 'IT_ADMIN' } },
            ),
        );
      if (complete) {
        await h.claim(opened.taskId).expect(200);
        await h.revoked(opened.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed' }).expect(200);
      }
      await h.decideSpend(request.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

      return { request, assignmentId };
    };

    it('fails the request, lets the cost go back and keeps the approval, when the seat was taken away meanwhile', async () => {
      const { request, assignmentId } = await revokedMeanwhile(true);

      expect(await h.state(request.id)).toBe('FAILED');
      expect(await commitmentOf(request.id)).toEqual([
        expect.objectContaining({ state: 'RELEASED', released_minor: String(5 * M) }),
      ]);
      expect(await h.successorsOf(assignmentId)).toEqual([]);
      expect((await h.eventsOf('ACCESS_REQUEST.RENEWAL_NOT_APPLIED', request.id))[0].after).toMatchObject({
        problem: 'NOT_OPEN',
      });
      // What was decided is not decided again: the approval stays on the request.
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM spend_decisions WHERE request_id = $1`, [request.id])).rowCount,
      ).toBe(1);
      expect(await holds(assignmentId)).toBe(false);
    });

    it('fails the request when the seat is being revoked, because the revocation has to end the record it names', async () => {
      const { request, assignmentId } = await revokedMeanwhile(false);

      expect(await h.state(request.id)).toBe('FAILED');
      expect((await h.eventsOf('ACCESS_REQUEST.RENEWAL_NOT_APPLIED', request.id))[0].after).toMatchObject({
        problem: 'REVOCATION_PENDING',
      });
      expect((await h.seatRow(assignmentId)).valid_until).toBeNull();
    });
  });
});
