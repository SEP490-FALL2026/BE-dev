import { renewalEndOf } from '../../../src/core/term-limit';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { ExpiryRenewalWindowService } from '../../../src/modules/licensing/expiry/expiry-renewal-window.service';
import { LicensingRenewalApi } from '../../../src/modules/licensing/public/licensing-renewal.api';
import { YearStartCommitmentsRepo } from '../../../src/modules/requests/year-start-commitments/year-start-commitments.repo';
import { ReturnHarness, type RenewalWire } from '../../support/return-harness';

const h = new ReturnHarness();
const REASON = 'The work goes on';

/**
 * The renewal of a right that ends on a day, over PostgreSQL (`BR-MF1-08`, `QĐ-108a`, `QĐ-108b`, `BR-MF1-08d`): sent only within the window
 * of `RENEWAL_WINDOW_DAYS` days before the approved end, with the new end date the holder enters (at most twelve months on); the window is
 * recorded once when it opens and its holder and head are told; approval opens an IT task EXTEND instead of extending the right, and the
 * record that follows the old one is written only when the IT Admin completes it. Until then the request is approved and not granted, for
 * the commitment of 01/01 too (RV-03).
 */
describe('the window and the IT extension of a renewal (integration, real PostgreSQL, BR-MF1-08)', () => {
  let internalPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    internalPlan = await h.plan('K5');
    await h.setParameter('RENEWAL_WINDOW_DAYS', 30).expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a head and a member who holds a free right that ends `endsIn` days from today. */
  const holder = async (endsIn: number) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-RW${counter}`);
    const end = h.inDays(endsIn);
    const assignmentId = await h.seatOf(unit.member, { planId: internalPlan }, { expectedEndDate: end });

    return { unit, assignmentId, end };
  };
  const body = (assignmentId: string, newEndDate: string) => ({ assignmentId, newEndDate, businessReason: REASON });
  const extensionTaskOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ id: string; kind: string; status: string; assignment_id: string }>(
        `SELECT id, kind::text AS kind, status::text AS status, assignment_id FROM provisioning_tasks WHERE request_id = $1`,
        [requestId],
      )
    ).rows;

  describe('BR-MF1-08a: the window of RENEWAL_WINDOW_DAYS days before the approved end', () => {
    it('refuses a renewal sent before the window opens, with the day it opens and its days', async () => {
      const { unit, assignmentId, end } = await holder(45);

      const refused = await h.renew(body(assignmentId, h.inDays(120)), unit.member.account).expect(409);

      expect(h.codeOf(refused)).toBe('RENEWAL_REQUEST.WINDOW_NOT_OPEN');
      expect(h.detailsOf(refused)).toEqual({ opensOn: renewalWindowStart(end, 30), windowDays: 30 });
    });

    it('takes a renewal sent on the first day of the window and on the last day of the right', async () => {
      const first = await holder(30);
      const last = await holder(0);

      await h.renew(body(first.assignmentId, h.inDays(90)), first.unit.member.account).expect(201);
      await h.renew(body(last.assignmentId, h.inDays(60)), last.unit.member.account).expect(201);
    });

    it('QĐ-108b: a window recorded when it opened keeps its days when the parameter is lowered later', async () => {
      const { unit, assignmentId } = await holder(25);
      expect(await h.ctx.app.get(ExpiryRenewalWindowService).openDue()).toBeGreaterThan(0);
      await h.setParameter('RENEWAL_WINDOW_DAYS', 10).expect(200);
      try {
        await h.renew(body(assignmentId, h.inDays(90)), unit.member.account).expect(201);
      } finally {
        await h.setParameter('RENEWAL_WINDOW_DAYS', 30).expect(200);
      }
    });

    it('QĐ-108b: a window not recorded yet follows the parameter in force', async () => {
      const { unit, assignmentId } = await holder(25);
      await h.setParameter('RENEWAL_WINDOW_DAYS', 10).expect(200);
      try {
        const refused = await h.renew(body(assignmentId, h.inDays(90)), unit.member.account).expect(409);
        expect(h.codeOf(refused)).toBe('RENEWAL_REQUEST.WINDOW_NOT_OPEN');
      } finally {
        await h.setParameter('RENEWAL_WINDOW_DAYS', 30).expect(200);
      }
    });

    it('records the window once and tells the holder and the head once; a recorded window is never changed', async () => {
      const { unit, assignmentId, end } = await holder(20);
      const windows = h.ctx.app.get(ExpiryRenewalWindowService);

      await windows.openDue();
      await windows.openDue();

      const { rows } = await h.ctx.sql.query<{ window_days: number; opens_on: string }>(
        `SELECT window_days, to_char(opens_on, 'YYYY-MM-DD') AS opens_on FROM assignment_renewal_windows
          WHERE assignment_id = $1`,
        [assignmentId],
      );
      expect(rows).toEqual([{ window_days: 30, opens_on: renewalWindowStart(end, 30) }]);
      const told = await h.ctx.sql.query<{ recipient_employee_id: string }>(
        `SELECT recipient_employee_id FROM in_app_notifications WHERE code = 'RENEWAL_WINDOW_OPENED' AND subject_id = $1`,
        [assignmentId],
      );
      expect(told.rows.map((row) => row.recipient_employee_id).sort()).toEqual(
        [unit.member.employeeId, unit.head.employeeId].sort(),
      );
      expect(await h.ctx.app.get(LicensingRenewalApi).renewalWindowOf(assignmentId, end)).toEqual({
        windowDays: 30,
        opensOn: renewalWindowStart(end, 30),
      });
      await expect(
        h.ctx.sql.query(`UPDATE assignment_renewal_windows SET window_days = 10 WHERE assignment_id = $1`, [
          assignmentId,
        ]),
      ).rejects.toThrow(/never changed or deleted/);
    });
  });

  describe('QĐ-108a RV-25: the new end date the holder enters', () => {
    it('refuses an end not after the current one and one more than twelve months after it', async () => {
      const { unit, assignmentId, end } = await holder(10);
      const maxEnd = renewalEndOf({ previousEnd: end, today: h.today(), months: 12 });

      for (const newEndDate of [end, h.inDays(5), nextDay(maxEnd)]) {
        const refused = await h.renew(body(assignmentId, newEndDate), unit.member.account).expect(422);
        expect(h.codeOf(refused)).toBe('RENEWAL_REQUEST.END_DATE_OUT_OF_RANGE');
        expect(h.detailsOf(refused)).toEqual({ previousEndDate: end, maxEndDate: maxEnd });
      }
      const { request } = await h.renewed(unit.member.account, body(assignmentId, maxEnd));
      expect(request.renewal).toMatchObject({ previousExpectedEndDate: end, newExpectedEndDate: maxEnd });
    });

    it('refuses a body with both the end date and the months, and one with neither', async () => {
      const { unit, assignmentId } = await holder(10);

      for (const sent of [
        { assignmentId, newEndDate: h.inDays(60), extensionMonths: 2, businessReason: REASON },
        { assignmentId, businessReason: REASON },
      ]) {
        const refused = await h.renew(sent, unit.member.account).expect(422);
        expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('BR-MF1-08d RV-03: approval opens an IT task EXTEND; the IT Admin extends the right', () => {
    it('approval leaves the right as it is and opens the task; completing it writes the record that follows', async () => {
      const { unit, assignmentId, end } = await holder(10);
      const newEnd = h.inDays(100);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, newEnd));

      await h.decide(request.id, { decision: 'APPROVE' }, unit.head.account).expect(200);

      const [task] = await extensionTaskOf(request.id);
      expect(task).toMatchObject({ kind: 'EXTEND', status: 'QUEUED', assignment_id: assignmentId });
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: end });
      expect(await h.successorsOf(assignmentId)).toEqual([]);
      const waiting = h.dataOf<{ request: RenewalWire }>(await h.fetch(request.id, unit.member.account).expect(200));
      expect(waiting.request.state).toBe('AWAITING_EXECUTION');
      // The right is held while the IT Admin has not extended it, even past its end (BR-MF1-08d).
      expect(await h.ctx.app.get(LicensingRenewalApi).hasPendingRenewal(assignmentId)).toBe(true);

      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Extended with the vendor until the new end' }).expect(200);

      const [next] = await h.successorsOf(assignmentId);
      expect(next).toMatchObject({ predecessor_id: assignmentId, expected_end_date: newEnd, valid_until: null });
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: end, expected_end_date: end });
      const done = h.dataOf<{ request: RenewalWire }>(await h.fetch(request.id, unit.member.account).expect(200));
      expect(done.request.state).toBe('COMPLETED');
      expect(done.request.renewal?.applied?.successorAssignmentId).toBe(next.id);
      expect((await extensionTaskOf(request.id))[0].status).toBe('COMPLETED');
    });

    it('an extension task closed as failed ends the renewal as FAILED, writes no record that follows and leaves the right its old end', async () => {
      const { unit, assignmentId, end } = await holder(10);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, h.inDays(100)));
      await h.decide(request.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      const [task] = await extensionTaskOf(request.id);

      await h.claim(task.id).expect(200);
      await h.fail(task.id, { reason: 'The vendor refused the extension' }).expect(200);
      await h.closeFailed(task.id, { reason: 'The vendor will not extend it' }).expect(200);

      const ended = h.dataOf<{ request: RenewalWire }>(await h.fetch(request.id, unit.member.account).expect(200));
      expect(ended.request.state).toBe('FAILED');
      expect((await extensionTaskOf(request.id))[0].status).toBe('CLOSED_FAILED');
      expect(await h.successorsOf(assignmentId)).toEqual([]);
      // The right is neither failed nor freed: it keeps the end it had, and is no longer held past it for a renewal.
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: end });
      expect(await h.ctx.app.get(LicensingRenewalApi).hasPendingRenewal(assignmentId)).toBe(false);
      const events = (
        await h.ctx.sql.query<{ after: { problem: string; to: string } }>(
          `SELECT after FROM audit_events WHERE resource_id = $1 AND action = 'ACCESS_REQUEST.RENEWAL_NOT_APPLIED'`,
          [request.id],
        )
      ).rows;
      expect(events.map((event) => event.after)).toEqual([
        expect.objectContaining({ problem: 'EXTENSION_CLOSED_FAILED', to: 'FAILED' }),
      ]);
    });

    it('a renewal withdrawn while its extension task is open cancels the task (out of the IT queue) and leaves the right its old end', async () => {
      const { unit, assignmentId, end } = await holder(10);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, h.inDays(100)));
      await h.decide(request.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      expect((await extensionTaskOf(request.id))[0]).toMatchObject({ kind: 'EXTEND', status: 'QUEUED' });

      await h.withdrawRequest(request.id, { reason: 'No longer needed' }, unit.member.account).expect(200);

      const withdrawn = h.dataOf<{ request: RenewalWire }>(await h.fetch(request.id, unit.member.account).expect(200));
      expect(withdrawn.request.state).toBe('WITHDRAWN');
      // The task is cancelled the way the grant of a withdrawn request is (US-05-08): no IT Admin works it any more.
      expect(await extensionTaskOf(request.id)).toEqual([
        expect.objectContaining({ kind: 'EXTEND', status: 'CANCELLED', assignment_id: assignmentId }),
      ]);
      // The right is the assignment itself: it is neither cancelled nor extended, and keeps its old end.
      expect(await h.successorsOf(assignmentId)).toEqual([]);
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: end });
      expect(await h.ctx.app.get(LicensingRenewalApi).hasPendingRenewal(assignmentId)).toBe(false);
    });

    it('RV-03: a renewal approved and not extended yet counts on 01/01 as approved and not granted, to its new end', async () => {
      const { unit, assignmentId } = await holder(10);
      const newEnd = h.inDays(100);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, newEnd));
      await h.decide(request.id, { decision: 'APPROVE' }, unit.head.account).expect(200);

      const seats = await h.ctx.app.get(TransactionRunner).run((tx) =>
        h.ctx.app.get(YearStartCommitmentsRepo).unclaimedSeats(tx, [
          {
            id: request.id,
            type: 'RENEWAL',
            state: 'AWAITING_EXECUTION',
            planId: internalPlan,
            departmentId: unit.department.id,
            expectedEndDate: newEnd,
          },
        ]),
      );

      expect(seats.get(request.id)).toEqual([{ expectedEndDate: newEnd }]);
    });

    it('the database refuses an extension task with no request, and a second open one for the seat', async () => {
      const { unit, assignmentId } = await holder(10);
      const { request } = await h.renewed(unit.member.account, body(assignmentId, h.inDays(60)));
      await h.decide(request.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      const [task] = await extensionTaskOf(request.id);

      await expect(
        h.ctx.sql.query(
          `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, max_attempts, created_by_app_user_id)
           SELECT gen_random_uuid(), organization_id, assignment_id, 'EXTEND', 'MANUAL', 1, created_by_app_user_id
             FROM provisioning_tasks WHERE id = $1`,
          [task.id],
        ),
      ).rejects.toThrow(/provisioning_tasks_kind_request/);
      await expect(
        h.ctx.sql.query(
          `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
           SELECT gen_random_uuid(), organization_id, assignment_id, 'EXTEND', 'MANUAL', request_id, 1, created_by_app_user_id
             FROM provisioning_tasks WHERE id = $1`,
          [task.id],
        ),
      ).rejects.toThrow(/provisioning_tasks_one_open_extension_per_assignment/);
    });
  });
});

/** The first day of the window of a right ending on `end`: `days` days before it. */
function renewalWindowStart(end: string, days: number): string {
  const date = new Date(`${end}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}
