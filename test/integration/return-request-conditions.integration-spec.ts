import { randomUUID } from 'node:crypto';
import { ReturnHarness } from '../support/return-harness';
import type { Person } from '../support/request-harness';
import type { Unit } from '../support/spend-harness';

const h = new ReturnHarness();

describe('which seat may be returned, and what the return leaves behind over PostgreSQL (US-05-13)', () => {
  let subscriptionId: string;
  let internalPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(10, 'K2');
    internalPlan = await h.plan('K5');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unitWithSeat = async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-RC${counter}`);

    return { unit, assignmentId: await h.seatOf(unit.member, { subscriptionId }) };
  };
  const reason = { reason: 'The project is over' };
  const counts = async () => [await h.count('return_requests'), await h.count('provisioning_tasks')];
  /** A seat written straight into the table: what the routes of the baseline refuse to make (K4, a service account). */
  const written = async (person: Person, unit: Unit, shape: 'K4' | 'SERVICE') => {
    const id = randomUUID();
    const target = shape === 'K4' ? await h.subscription(5, 'K4') : subscriptionId;
    const planId = await h.planOf(target);
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from,
         valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, $3::"AssignmentKind", 'REQUEST', $4, $5, $6, $7, $7, $8, $9, $10, '2026-10-05', 'ACTUAL', $11)`,
      [
        id,
        h.seed.organizationId,
        shape === 'SERVICE' ? 'SERVICE' : 'PERSONAL',
        planId,
        target,
        person.employeeId,
        `${shape.toLowerCase()}-${counter}@acme.vn`,
        shape === 'SERVICE' ? 'Build bot' : null,
        shape === 'SERVICE' ? unit.department.unitId : null,
        shape === 'SERVICE' ? unit.department.id : null,
        randomUUID(),
      ],
    );

    return id;
  };

  describe('what is refused, and leaves nothing behind', () => {
    it('refuses a second return of a seat that waits for its revocation', async () => {
      const { unit, assignmentId } = await unitWithSeat();
      await h.returned(unit.member.account, { assignmentId, ...reason });
      const before = await counts();

      const again = await h.returnSeat({ assignmentId, ...reason }, unit.head.account).expect(409);

      expect(h.codeOf(again)).toBe('RETURN_REQUEST.ALREADY_REQUESTED');
      expect(await counts()).toEqual(before);
    });

    it('lets one of two people who ask at once win, and the other is told it is already asked', async () => {
      const { unit, assignmentId } = await unitWithSeat();

      const [byHolder, byHead] = await Promise.all([
        h.returnSeat({ assignmentId, ...reason }, unit.member.account),
        h.returnSeat({ assignmentId, ...reason }, unit.head.account),
      ]);

      expect([byHolder.status, byHead.status].sort()).toEqual([201, 409]);
      const refused = byHolder.status === 409 ? byHolder : byHead;
      expect(h.codeOf(refused)).toBe('RETURN_REQUEST.ALREADY_REQUESTED');
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM return_requests WHERE assignment_id = $1`, [assignmentId])).rowCount,
      ).toBe(1);
    });

    it('refuses a seat that has ended, a service account, a K4 key and a seat whose grant is not done', async () => {
      const ended = await unitWithSeat();
      const endedTask = (
        await h.returnRow(
          (await h.returned(ended.unit.member.account, { assignmentId: ended.assignmentId, ...reason })).id,
        )
      ).revocation_task_id;
      await h.claim(endedTask).expect(200);
      await h.revoked(endedTask, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed' }).expect(200);
      const service = await unitWithSeat();
      const serviceSeat = await written(service.unit.member, service.unit, 'SERVICE');
      const k4 = await unitWithSeat();
      const k4Seat = await written(k4.unit.member, k4.unit, 'K4');
      // A seat granted through a request whose task nobody has done.
      counter += 1;
      const granting = await h.departmentWithHead(`P-RC${counter}`);
      const sentRequest = await h.sent(granting.member, internalPlan, { termMonths: 1 });
      await h.decide(sentRequest.id, { decision: 'APPROVE' }, granting.head.account).expect(200);
      const granted = h.dataOf<{ task: { id: string; assignmentId: string } }>(
        await h.grant({ requestId: sentRequest.id }).expect(201),
      ).task;
      const before = await counts();

      const cases: Array<[string, string, string, Person]> = [
        ['NOT_OPEN', ended.assignmentId, 'ended', ended.unit.member],
        ['SERVICE_ACCOUNT', serviceSeat, 'service', service.unit.member],
        ['PLAN_NOT_SUPPORTED', k4Seat, 'k4', k4.unit.member],
        ['GRANT_NOT_COMPLETED', granted.assignmentId, 'granting', granting.member],
      ];
      for (const [problem, assignmentId, , person] of cases) {
        const response = await h.returnSeat({ assignmentId, ...reason }, person.account).expect(409);
        expect(h.codeOf(response)).toBe('RETURN_REQUEST.ASSIGNMENT_NOT_RETURNABLE');
        expect(h.detailsOf(response)).toEqual({ reason: problem });
      }

      expect(await counts()).toEqual(before);
    });
  });

  describe('a seat that was granted, in the same day (postcondition) and by a request that cannot be withdrawn (US-05-08)', () => {
    /** A request for internal software granted and done today: its seat began today. */
    const grantedToday = async () => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-RC${counter}`);
      const sent = await h.sent(unit.member, internalPlan, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      const task = h.dataOf<{ task: { id: string; assignmentId: string } }>(
        await h.grant({ requestId: sent.id }).expect(201),
      ).task;
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Granted in the internal portal' }).expect(200);

      return { unit, requestId: sent.id, assignmentId: task.assignmentId };
    };

    it('ends a seat granted today on the day after, because its period is never empty', async () => {
      const { unit, assignmentId } = await grantedToday();
      const wire = await h.returned(unit.member.account, { assignmentId, ...reason });
      const taskId = (await h.returnRow(wire.id)).revocation_task_id;
      await h.claim(taskId).expect(200);

      await h.revoked(taskId, { completion: 'OFF_SYSTEM_REVOKED', evidence: 'Revoked in the portal' }).expect(200);

      expect((await h.seatRow(assignmentId)).valid_until).toBe(h.inDays(1));
    });

    it('tells the person who cannot withdraw a request that was granted which seat to return, and follows it (AC gắn rút)', async () => {
      const { unit, requestId, assignmentId } = await grantedToday();
      const other = await grantedToday();

      const refused = await h.withdrawRequest(requestId, {}, unit.member.account).expect(409);
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.GRANT_COMPLETED');
      expect(h.detailsOf(refused)).toEqual({ assignmentId });

      // The request that is named must be the one whose grant made the seat, and the person must have a part in it.
      const wrong = await h
        .returnSeat({ assignmentId, ...reason, fromRequestId: other.requestId }, unit.member.account)
        .expect(422);
      expect(h.codeOf(wrong)).toBe('RETURN_REQUEST.ORIGIN_MISMATCH');
      const unknown = await h
        .returnSeat({ assignmentId, ...reason, fromRequestId: randomUUID() }, unit.member.account)
        .expect(422);
      expect(h.codeOf(unknown)).toBe('RETURN_REQUEST.ORIGIN_MISMATCH');
      const stranger = await h
        .returnSeat({ assignmentId, ...reason, fromRequestId: requestId }, unit.head.account)
        .expect(422);
      expect(h.codeOf(stranger)).toBe('RETURN_REQUEST.ORIGIN_MISMATCH');

      const wire = await h.returned(unit.member.account, { assignmentId, ...reason, fromRequestId: requestId });
      expect(wire.originRequestId).toBe(requestId);
      expect((await h.returnRow(wire.id)).origin_request_id).toBe(requestId);
    });
  });

  describe('when the revocation cannot be done (AC-8)', () => {
    it('leaves the seat held and the return waiting, and fails the return only when the IT Admin closes the task', async () => {
      const { unit, assignmentId } = await unitWithSeat();
      const freeBefore = await h.freeSeats(subscriptionId);
      const wire = await h.returned(unit.member.account, { assignmentId, ...reason });
      const taskId = (await h.returnRow(wire.id)).revocation_task_id;
      await h.claim(taskId).expect(200);

      await h.fail(taskId, { reason: 'The admin console is down' }).expect(200);
      await h.retry(taskId).expect(200);
      await h.claim(taskId).expect(200);
      await h.fail(taskId, { reason: 'The admin console is still down' }).expect(200);

      expect((await h.returnRow(wire.id)).state).toBe('AWAITING_REVOCATION');
      expect((await h.seatRow(assignmentId)).valid_until).toBeNull();
      expect(await h.freeSeats(subscriptionId)).toBe(freeBefore);

      await h.closeFailed(taskId, { reason: 'The member cannot be removed from the console' }).expect(200);

      const row = await h.returnRow(wire.id);
      expect(row).toMatchObject({ state: 'FAILED', failure_reason: 'The member cannot be removed from the console' });
      const failed = h.dataOf<{ returnRequest: { state: string; failureReason: string; failedAt: string } }>(
        await h.returnGet(wire.id, unit.member.account).expect(200),
      ).returnRequest;
      expect(failed).toMatchObject({ state: 'FAILED', failureReason: 'The member cannot be removed from the console' });
      // The seat is still held and nothing says it was returned; the audit says so.
      expect((await h.seatRow(assignmentId)).valid_until).toBeNull();
      expect(await h.freeSeats(subscriptionId)).toBe(freeBefore);
      expect((await h.eventsOf('RETURN_REQUEST.FAILED', wire.id))[0].after).toMatchObject({
        assignmentStillOpen: true,
      });
      expect(await h.eventsOf('RETURN_REQUEST.COMPLETED', wire.id)).toEqual([]);

      // A seat whose revocation was closed as failed may be asked for again, which opens a new task; only that one gives it back.
      const again = await h.returned(unit.member.account, { assignmentId, ...reason });
      const secondTask = (await h.returnRow(again.id)).revocation_task_id;
      expect(secondTask).not.toBe(taskId);
      await h.claim(secondTask).expect(200);
      await h.revoked(secondTask, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed by hand' }).expect(200);
      expect((await h.returnRow(again.id)).state).toBe('COMPLETED');
      expect((await h.returnRow(wire.id)).state).toBe('FAILED');
      expect(await h.freeSeats(subscriptionId)).toBe((freeBefore ?? 0) + 1);
    });

    it('takes a return of a seat that another source is already revoking as one more reason of the same task', async () => {
      const { unit, assignmentId } = await unitWithSeat();
      const facade = await import('../../src/modules/licensing/licensing.service');
      const { TransactionRunner } = await import('../../src/infrastructure/database/transaction-runner');
      const licensing = h.ctx.app.get(facade.LicensingService);
      const opened = await h.ctx.app
        .get(TransactionRunner)
        .run((tx) =>
          licensing.openRevocation(
            tx,
            { ...h.principal(h.it1, ['IT_ADMIN']), roles: ['MANAGER'] },
            { assignmentId, source: 'GHOST_SEAT', decision: { decidedRole: 'IT_ADMIN' } },
          ),
        );

      const wire = await h.returned(unit.member.account, { assignmentId, ...reason });

      const row = await h.returnRow(wire.id);
      expect(row.revocation_task_id).toBe(opened.taskId);
      expect((await h.reasonsOf(opened.taskId)).map((entry) => entry.source)).toEqual(['GHOST_SEAT', 'RETURN']);
      expect((await h.eventsOf('RETURN_REQUEST.SUBMITTED', wire.id))[0].after).toMatchObject({
        revocationTaskCreated: false,
      });
    });
  });
});
