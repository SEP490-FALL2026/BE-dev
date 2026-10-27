import { randomUUID } from 'node:crypto';
import { RegisteredRenewalHold } from '../../src/modules/licensing/assignment/registered-renewal-hold.service';
import { ExpiryHarness } from '../support/expiry-harness';
import { PgRelay } from '../support/pg-relay';
import { dataStatements, QueryCounter } from '../support/query-count';

const h = new ExpiryHarness();
const M = 1_000_000;

/**
 * US-03-05 AC-2, AC-3, AC-6 to AC-9, AC-11: the queue of the IT Admin for the rights that ended and the start of their revocation,
 * over HTTP on real PostgreSQL. A right is read into the queue from the day after its end, stays in force and is never revoked or
 * renewed by itself; a renewal sent in time keeps it waiting; the revocation goes through the one gate with the source of an expiry,
 * its handover falls to the IT Admin, and a failure never means the right was lost.
 */
describe('the rights that ended and the IT Admin queue (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let lossy: { subscriptionId: string; planId: string };
  let plain: { subscriptionId: string; planId: string };
  let internalPlan: string;
  let seq = 0;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
    const subscriptionOf = async (note: string | null, dataLoss: boolean) => {
      const subscriptionId = await h.subscription(60, 'K2');
      const planId = await h.planOf(subscriptionId);
      await h.describeRemoval(planId, note, dataLoss);

      return { subscriptionId, planId };
    };
    lossy = await subscriptionOf('Export the boards before the seat is taken away', true);
    plain = await subscriptionOf(null, false);
    internalPlan = await h.plan('K5');
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** A department with a head and a member whose right on the target ended `endedDaysAgo` days ago (negative: ends later). */
  const right = async (endedDaysAgo: number, target: { subscriptionId?: string; planId?: string } = plain) => {
    seq += 1;
    const unit = await h.departmentWithHead(`P-XQ${seq}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const assignmentId = await h.seatOf(unit.member, target, { expectedEndDate: h.inDays(-endedDaysAgo) });

    return { unit, assignmentId };
  };
  const started = async (assignmentId: string) => {
    const response = await h.startRevocation(assignmentId).expect(201);

    return h.dataOf<{ revocation: { taskId: string; taskStatus: string; created: boolean; reasonAdded: boolean } }>(
      response,
    ).revocation;
  };

  describe('the queue, read from the assignments (AC-2, AC-3)', () => {
    it('lists a right from the day after its end, in force and untouched, with nothing started by itself (AC-2)', async () => {
      const { unit, assignmentId } = await right(1);
      const endsToday = await right(0);
      const endsLater = await right(-3);
      const tasksBefore = await h.count('provisioning_tasks');

      const row = await h.queueRowOf(assignmentId);

      expect(row).toMatchObject({
        assignmentId,
        employee: { id: unit.member.employeeId },
        department: { id: unit.department.id, code: unit.department.code },
        plan: { planId: plain.planId, provisioningType: 'K2', dataLossOnRemoval: false },
        expectedEndDate: h.inDays(-1),
        daysOverdue: 1,
        debt: false,
        status: 'READY_TO_REVOKE',
        pendingRenewal: null,
        revocation: null,
        handover: null,
      });
      expect(await h.queueRowOf(endsToday.assignmentId)).toBeUndefined();
      expect(await h.queueRowOf(endsLater.assignmentId)).toBeUndefined();
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: h.inDays(-1) });
      expect(await h.liveTaskOf(assignmentId)).toBeNull();
      expect(await h.count('provisioning_tasks')).toBe(tasksBefore);
    });

    it('flags a debt only after seven days and filters by status, debt and department (AC-3)', async () => {
      const seven = await right(7);
      const eight = await right(8);
      const ten = await right(10);
      const fresh = await right(2);

      const rows = new Map((await h.queueRows()).map((row) => [row.assignmentId, row]));

      expect(rows.get(seven.assignmentId)).toMatchObject({ daysOverdue: 7, debt: false });
      expect(rows.get(eight.assignmentId)).toMatchObject({ daysOverdue: 8, debt: true });
      expect(rows.get(ten.assignmentId)).toMatchObject({ daysOverdue: 10, debt: true });
      const ids = async (query: string) => (await h.queueRows(query)).map((row) => row.assignmentId);
      const debts = await ids('&debt=true');
      expect(debts).toEqual(expect.arrayContaining([eight.assignmentId, ten.assignmentId]));
      expect(debts).not.toContain(seven.assignmentId);
      expect(await ids('&debt=false')).toEqual(expect.arrayContaining([seven.assignmentId, fresh.assignmentId]));
      expect(await ids(`&departmentId=${ten.unit.department.id}`)).toEqual([ten.assignmentId]);
      expect(await ids('&status=REVOCATION_OPEN')).not.toContain(ten.assignmentId);
      // The earliest end first.
      const order = await ids('');
      expect(order.indexOf(ten.assignmentId)).toBeLessThan(order.indexOf(fresh.assignmentId));
      expect((await h.queue('?status=NOPE').expect(422)).status).toBe(422);
    });

    it('is open to the IT Admin alone: Finance, a head and an employee are refused and nothing starts', async () => {
      const { unit, assignmentId } = await right(2);
      const tasksBefore = await h.count('provisioning_tasks');

      for (const account of [h.finance, unit.head.account, unit.member.account]) {
        expect(h.codeOf(await h.queue('', account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
        expect(h.codeOf(await h.startRevocation(assignmentId, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      }
      expect(await h.count('provisioning_tasks')).toBe(tasksBefore);
    });

    it('answers a page with the same number of statements however many rights there are', async () => {
      const first = await right(3, lossy);
      await started(first.assignmentId);
      const read = async () => {
        const run = await counter.run(() => h.queue('?pageSize=100').expect(200));

        return {
          rows: h.dataOf<{ items: { assignmentId: string }[] }>(run.result).items,
          statements: dataStatements(run.statements).length,
        };
      };
      const small = await read();

      for (let index = 0; index < 3; index += 1) await right(3 + index);
      const large = await read();

      expect(large.rows.length).toBeGreaterThan(small.rows.length);
      expect(large.statements).toBe(small.statements);
    });
  });

  describe('a renewal sent in time keeps the right waiting (AC-6, AC-7, AC-8)', () => {
    it('waits while the renewal is undecided, refuses to start, and starts once it is refused or withdrawn (AC-6, AC-7)', async () => {
      const { unit, assignmentId } = await right(2);
      const waiting = new Map([[assignmentId, { requestId: randomUUID(), state: 'PENDING' }]]);
      const restore = h.waitingRenewals(waiting);
      try {
        const row = await h.queueRowOf(assignmentId);
        expect(row).toMatchObject({
          status: 'WAITING_RENEWAL_DECISION',
          pendingRenewal: { requestId: waiting.get(assignmentId)?.requestId, state: 'PENDING' },
          revocation: null,
        });
        const refused = await h.startRevocation(assignmentId).expect(409);
        expect(h.codeOf(refused)).toBe('ASSIGNMENT_EXPIRY.RENEWAL_PENDING');
        expect(await h.liveTaskOf(assignmentId)).toBeNull();
        expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: h.inDays(-2) });
        expect(unit.member.employeeId).toBe(row?.employee.id);

        waiting.delete(assignmentId);

        expect((await h.queueRowOf(assignmentId))?.status).toBe('READY_TO_REVOKE');
        const opened = await started(assignmentId);
        expect(opened).toMatchObject({ created: true, reasonAdded: false, taskStatus: 'QUEUED' });
      } finally {
        restore();
      }
    });

    it('leaves the queue when the renewal that was approved ends the old record at its end day (AC-7)', async () => {
      const { assignmentId } = await right(2);
      expect(await h.queueRowOf(assignmentId)).toBeDefined();

      // What the approval of a renewal writes: the old record ends on the end it had.
      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = expected_end_date WHERE id = $1`, [
        assignmentId,
      ]);

      expect(await h.queueRowOf(assignmentId)).toBeUndefined();
      expect(h.codeOf(await h.startRevocation(assignmentId).expect(409))).toBe('ASSIGNMENT_EXPIRY.NOT_OPEN');
    });

    it('is told by the module of requests only of a renewal that was really sent and is not decided (AC-6, AC-7)', async () => {
      seq += 1;
      const unit = await h.departmentWithHead(`P-XQ${seq}`);
      await h.budgetFor(unit, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const assignmentId = await h.seatOf(unit.member, { planId: internalPlan }, { expectedEndDate: h.inDays(1) });
      const reader = h.ctx.app.get(RegisteredRenewalHold);

      expect((await reader.pendingRenewalsOf([assignmentId])).size).toBe(0);
      const { request } = await h.renewed(unit.member.account, {
        assignmentId,
        newExpectedEndDate: h.inDays(60),
        businessReason: 'The work goes on',
      });
      expect((await reader.pendingRenewalsOf([assignmentId])).get(assignmentId)).toMatchObject({
        requestId: request.id,
        state: 'PENDING',
      });

      await h.decide(request.id, { decision: 'REJECT', reason: 'No longer needed' }, unit.head.account).expect(200);

      expect((await reader.pendingRenewalsOf([assignmentId])).size).toBe(0);
    });

    it('ignores a renewal sent after the end: it is a new request and the revocation goes on (AC-8)', async () => {
      seq += 1;
      const unit = await h.departmentWithHead(`P-XQ${seq}`);
      await h.budgetFor(unit, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const assignmentId = await h.seatOf(unit.member, { planId: internalPlan }, { expectedEndDate: h.inDays(-3) });

      const late = await h.renewed(unit.member.account, {
        assignmentId,
        newExpectedEndDate: h.inDays(60),
        businessReason: 'The work goes on',
      });

      expect(late.outcome).toBe('NEW_REQUEST');
      expect((await h.queueRowOf(assignmentId))?.status).toBe('READY_TO_REVOKE');
      expect((await started(assignmentId)).created).toBe(true);
    });
  });

  describe('the revocation of a right that ended (AC-7, AC-9)', () => {
    it('opens a task with the source of an expiry, asks again for nothing more, and keeps the right until it is completed', async () => {
      const { assignmentId } = await right(2);

      const first = await started(assignmentId);
      const again = await started(assignmentId);

      expect(first).toMatchObject({ created: true, reasonAdded: false, taskStatus: 'QUEUED' });
      expect(again).toEqual({ ...first, created: false });
      const task = await h.liveTaskOf(assignmentId);
      expect(task).toMatchObject({ id: first.taskId, source: 'TIME_LIMITED_EXPIRY' });
      expect(await h.reasonsOf(first.taskId)).toEqual([
        {
          source: 'TIME_LIMITED_EXPIRY',
          decided_role: 'END_DATE',
          reference_kind: 'ASSIGNMENT_END_DATE',
          reference_id: assignmentId,
        },
      ]);
      expect((await h.eventsOf('PROVISIONING_TASK.REVOCATION_OPENED', first.taskId))[0].after).toMatchObject({
        source: 'TIME_LIMITED_EXPIRY',
        decidedByEmployeeId: null,
      });
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null });
      expect(await h.queueRowOf(assignmentId)).toMatchObject({
        status: 'REVOCATION_OPEN',
        revocation: { taskId: first.taskId, status: 'QUEUED' },
        handover: null,
      });

      await h.claim(first.taskId).expect(200);
      await h
        .revoked(first.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
        .expect(200);

      expect((await h.seatRow(assignmentId)).valid_until).toBe(h.today());
      expect(await h.queueRowOf(assignmentId)).toBeUndefined();
      expect(h.codeOf(await h.startRevocation(assignmentId).expect(409))).toBe('ASSIGNMENT_EXPIRY.NOT_OPEN');
    });

    it('adds its reason to the task another source already opened, and refuses what is not an expired right (AC-7)', async () => {
      const { unit, assignmentId } = await right(2);
      const returned = await h.returned(unit.member.account, { assignmentId, reason: 'The project is over' });
      const returnTask = (await h.returnRow(returned.id)).revocation_task_id;

      const opened = await started(assignmentId);

      expect(opened).toMatchObject({ taskId: returnTask, created: false, reasonAdded: true });
      expect((await h.reasonsOf(returnTask)).map((reason) => reason.source)).toEqual(['RETURN', 'TIME_LIMITED_EXPIRY']);

      const today = await right(0);
      expect(h.codeOf(await h.startRevocation(today.assignmentId).expect(409))).toBe('ASSIGNMENT_EXPIRY.NOT_EXPIRED');
      expect(h.codeOf(await h.startRevocation(randomUUID()).expect(404))).toBe('ASSIGNMENT_EXPIRY.NOT_FOUND');
      expect(await h.liveTaskOf(today.assignmentId)).toBeNull();
    });

    it('asks the IT Admin, not the head, to confirm the handover, holds the work for it, and goes on flagged after the short deadline (AC-9)', async () => {
      const { unit, assignmentId } = await right(2, lossy);
      const { taskId } = await started(assignmentId);

      const [duty] = await h.dutyRows(assignmentId);
      expect(duty).toMatchObject({ source: 'TIME_LIMITED_EXPIRY', confirmer_role: 'IT_ADMIN', confirmed_value: null });
      expect(duty.due_on >= h.today()).toBe(true);
      expect((await h.queueRowOf(assignmentId))?.handover).toMatchObject({
        dutyId: duty.id,
        status: 'OPEN',
        role: 'IT_ADMIN',
        overdue: false,
        flaggedUnconfirmed: false,
      });
      expect((await h.queueRowOf(assignmentId))?.plan.dataLossOnRemoval).toBe(true);
      // The head is not who confirms; the work is held until the IT Admin does.
      expect(h.codeOf(await h.confirmDuty(duty.id, { value: 'HANDLED' }, unit.head.account).expect(403))).toBe(
        'HANDOVER_DUTY.NOT_CONFIRMER',
      );
      expect(h.codeOf(await h.claim(taskId).expect(409))).toBe('HANDOVER.CONFIRMATION_PENDING');

      await h.confirmDuty(duty.id, { value: 'HANDLED' }).expect(201);
      await h.claim(taskId).expect(200);
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);

      expect((await h.dutyRows(assignmentId))[0]).toMatchObject({
        confirmed_value: 'HANDLED',
        proceeded_unconfirmed_at: null,
      });
      expect((await h.seatRow(assignmentId)).valid_until).toBe(h.today());

      const late = await right(2, lossy);
      const lateTask = (await started(late.assignmentId)).taskId;
      await h.ctx.sql.query(`UPDATE handover_duties SET due_on = $2::date WHERE assignment_id = $1`, [
        late.assignmentId,
        h.inDays(-1),
      ]);
      expect((await h.queueRowOf(late.assignmentId))?.handover).toMatchObject({ overdue: true });
      await h.claim(lateTask).expect(200);
      await h.revoked(lateTask, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);

      const [flagged] = await h.dutyRows(late.assignmentId);
      expect(flagged.confirmed_value).toBeNull();
      expect(flagged.proceeded_unconfirmed_at).not.toBeNull();
      expect((await h.seatRow(late.assignmentId)).valid_until).toBe(h.today());
    });
  });

  describe('a revocation that fails never means the right was lost (AC-11)', () => {
    it('keeps the right in force and in the queue with the failed task, and the confirmation as it was', async () => {
      const { assignmentId } = await right(2, lossy);
      const { taskId } = await started(assignmentId);
      const [duty] = await h.dutyRows(assignmentId);
      await h.confirmDuty(duty.id, { value: 'HANDLED' }).expect(201);
      await h.claim(taskId).expect(200);

      await h.fail(taskId, { reason: 'The workspace admin cannot sign in' }).expect(200);

      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null });
      expect(await h.queueRowOf(assignmentId)).toMatchObject({
        status: 'REVOCATION_OPEN',
        revocation: { taskId, status: 'FAILED' },
        handover: { status: 'CONFIRMED' },
      });
      await h.retry(taskId).expect(200);
      expect((await h.queueRowOf(assignmentId))?.revocation).toMatchObject({ status: 'QUEUED' });
      await h.claim(taskId).expect(200);
      await h.fail(taskId, { reason: 'Still cannot sign in' }).expect(200);

      await h.closeFailed(taskId, { reason: 'Handled outside the system later' }).expect(200);

      // The right is still held and is back to waiting for the IT Admin; the confirmation that was written is not undone.
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null });
      expect((await h.queueRowOf(assignmentId))?.status).toBe('READY_TO_REVOKE');
      expect((await h.dutyRows(assignmentId))[0]).toMatchObject({ confirmed_value: 'HANDLED' });
      const again = await started(assignmentId);
      expect(again).toMatchObject({ created: true });
      expect(again.taskId).not.toBe(taskId);
    });
  });
});
