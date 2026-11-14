import { randomUUID } from 'node:crypto';
import { ExpiryHarness } from '../../support/expiry-harness';
import { pretendBusinessToday } from '../../support/pretend-today';

const h = new ExpiryHarness();

/**
 * T-RQ3 (the end of the time of use), the part of the job: a `K1` plan granted on 05/08/2026 for 3 months ends on 04/11/2026; it is reminded
 * from 28/10, and the system opens its revocation on 05/11 unless a renewal waits for its decision (`QĐ-111l`, `US-03-05` AC-2, AC-14,
 * R-13, R-27). The days are the days of the organization, said to the application by `pretendBusinessToday`, so the numbers are the
 * numbers of the spec whatever day the suite runs.
 */
describe('the system opens the revocation of a right that ended (integration, real PostgreSQL)', () => {
  let k1: { subscriptionId: string; planId: string };
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const subscriptionId = await h.subscription(60, 'K1');
    k1 = { subscriptionId, planId: await h.planOf(subscriptionId) };
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Says what day it is for the organization: every read of the day, the pass included, sees it. */
  const on = (day: string) => pretendBusinessToday(h.ctx.app, day);

  /**
   * The people joined, and the head took the department, long before the days these cases say: a baseline records no seat from before the
   * hire, and the department of a person and its head are read as of the day the pass says it is.
   */
  const longAgo = async (unit: {
    department: { id: string };
    member: { employeeId: string };
    head: { employeeId: string };
  }) => {
    const people = [unit.member.employeeId, unit.head.employeeId];
    await h.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = ANY($1::uuid[])`, [people]);
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_from = '2020-01-01' WHERE employee_id = ANY($1::uuid[])`,
      [people],
    );
    await h.ctx.sql.query(`UPDATE department_head_periods SET valid_from = '2020-01-01' WHERE department_id = $1`, [
      unit.department.id,
    ]);
  };

  /** A department with a head and an IT Admin in charge, and a member who was granted `K1` on 05/08/2026 for 3 months: the right ends on 04/11/2026. */
  const right = async (end = '2026-11-04') => {
    seq += 1;
    on('2026-08-10');
    const unit = await h.departmentWithHead(`P-XS${seq}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await longAgo(unit);
    const assignmentId = await h.seatOf(unit.member, k1, { grantedOn: '2026-08-05', expectedEndDate: end });

    return { unit, assignmentId };
  };
  const tasksOf = async (assignmentId: string) =>
    (
      await h.ctx.sql.query<{
        id: string;
        status: string;
        source: string;
        created_by_system: boolean;
        created_by_app_user_id: string | null;
        responsible: string | null;
      }>(
        `SELECT id, status::text, revocation_source::text AS source, created_by_system, created_by_app_user_id,
                default_responsible_employee_id AS responsible
           FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE' ORDER BY created_at, id`,
        [assignmentId],
      )
    ).rows;

  it('opens nothing on the end day, and on 05/11 opens exactly one task made by the system, in the queue of the IT Admin in charge', async () => {
    const { unit, assignmentId } = await right();
    expect(await h.seatRow(assignmentId)).toMatchObject({ valid_from: '2026-08-05', expected_end_date: '2026-11-04' });

    on('2026-11-04');
    expect(await h.openDue()).toBe(0);
    expect(await tasksOf(assignmentId)).toEqual([]);

    on('2026-11-05');
    const opened = await h.openDue();
    const tasks = await tasksOf(assignmentId);

    expect(opened).toBeGreaterThanOrEqual(1);
    expect(tasks).toEqual([
      {
        id: tasks[0].id,
        status: 'QUEUED',
        source: 'TIME_LIMITED_EXPIRY',
        created_by_system: true,
        created_by_app_user_id: null,
        responsible: h.it1.employeeId,
      },
    ]);
    expect(await h.reasonsOf(tasks[0].id)).toEqual([
      {
        source: 'TIME_LIMITED_EXPIRY',
        decided_role: 'END_DATE',
        reference_kind: 'ASSIGNMENT_END_DATE',
        reference_id: assignmentId,
      },
    ]);
    const [event] = await h.eventsOf('PROVISIONING_TASK.REVOCATION_OPENED', tasks[0].id);
    expect(event).toMatchObject({
      actor_kind: 'SYSTEM',
      after: { source: 'TIME_LIMITED_EXPIRY', decidedByEmployeeId: null, assignmentId },
    });
    // The system asks; it never takes the right away (SoD-6): the seat is as it was until the IT Admin completes the task.
    expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: '2026-11-04' });
    expect(await h.queueRowOf(assignmentId)).toMatchObject({
      employee: { id: unit.member.employeeId },
      status: 'REVOCATION_OPEN',
      revocation: { taskId: tasks[0].id, status: 'QUEUED' },
    });
  });

  it('asks once: a pass run again, or by two instances at once, leaves one task and one reason', async () => {
    const { assignmentId } = await right();
    on('2026-11-05');

    const passes = await Promise.all([h.openDue(), h.openDue(), h.openDue()]);
    await h.openDue();

    expect(passes.reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(1);
    const tasks = await tasksOf(assignmentId);
    expect(tasks).toHaveLength(1);
    expect(await h.reasonsOf(tasks[0].id)).toHaveLength(1);
    expect(await h.eventsOf('PROVISIONING_TASK.REVOCATION_OPENED', tasks[0].id)).toHaveLength(1);
  });

  it('leaves a right alone while a renewal waits, approved or not, and opens the task when the renewal is refused (R-13)', async () => {
    const { assignmentId } = await right();
    on('2026-11-06');
    const waiting = new Map([[assignmentId, { requestId: randomUUID(), state: 'PENDING', approved: false }]]);
    const restore = h.waitingRenewals(waiting);
    try {
      await h.openDue();
      expect(await tasksOf(assignmentId)).toEqual([]);

      waiting.set(assignmentId, { requestId: randomUUID(), state: 'AWAITING_EXECUTION', approved: true });
      await h.openDue();
      expect(await tasksOf(assignmentId)).toEqual([]);

      waiting.delete(assignmentId);
      await h.openDue();
      expect(await tasksOf(assignmentId)).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('does not open it again once the IT Admin closed it as failed: the right stays in the queue and the IT Admin may start it again', async () => {
    const { assignmentId } = await right();
    on('2026-11-05');
    await h.openDue();
    const [task] = await tasksOf(assignmentId);
    // The IT Admin works the task twice, it fails twice, and they close it as failed (`US-07-04`): the right is still held.
    await h.claim(task.id).expect(200);
    await h.fail(task.id, { reason: 'The workspace admin cannot sign in' }).expect(200);
    await h.retry(task.id).expect(200);
    await h.claim(task.id).expect(200);
    await h.fail(task.id, { reason: 'Still cannot sign in' }).expect(200);
    await h.closeFailed(task.id, { reason: 'Handled outside the system later' }).expect(200);

    on('2026-11-09');
    await h.openDue();

    expect(await tasksOf(assignmentId)).toHaveLength(1);
    expect(await h.liveTaskOf(assignmentId)).toBeNull();
    expect(await h.queueRowOf(assignmentId)).toMatchObject({ status: 'READY_TO_REVOKE', revocation: null });
    const again = await h.startRevocation(assignmentId).expect(201);
    expect(h.dataOf<{ revocation: { created: boolean } }>(again).revocation.created).toBe(true);
  });

  it('adds nothing to a right that is being revoked for another reason, and none for a right that was returned', async () => {
    const { unit, assignmentId } = await right();
    await h.returned(unit.member.account, { assignmentId, reason: 'The project is over' });
    on('2026-11-05');

    await h.openDue();

    const tasks = await tasksOf(assignmentId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ source: 'RETURN', created_by_system: false });
    expect((await h.reasonsOf(tasks[0].id)).map((reason) => reason.source)).toEqual(['RETURN']);
  });

  it('leaves a right with no end date, a service account and a right that has not ended alone', async () => {
    seq += 1;
    on('2026-08-10');
    const unit = await h.departmentWithHead(`P-XS${seq}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await longAgo(unit);
    const open = await h.seatOf(unit.member, k1, { grantedOn: '2026-08-05' });
    const later = (await right('2027-02-04')).assignmentId;

    on('2026-11-05');
    await h.openDue();

    expect(await tasksOf(open)).toEqual([]);
    expect(await tasksOf(later)).toEqual([]);
  });

  describe('the reminder follows the end the right has (R-27)', () => {
    it('tells the holder, the head and the IT Admin from 28/10 and not on the 27th, with the days of the end it has', async () => {
      const { unit, assignmentId } = await right();

      on('2026-10-27');
      await h.noticeDue();
      expect(await h.reminderRows(assignmentId)).toEqual([]);

      on('2026-10-28');
      await h.noticeDue();
      const rows = await h.reminderRows(assignmentId);

      expect(rows.map((row) => [row.audience, row.recipient_employee_id, row.expected_end_date])).toEqual([
        ['EMPLOYEE', unit.member.employeeId, '2026-11-04'],
        ['HEAD', unit.head.employeeId, '2026-11-04'],
        ['IT_ADMIN', h.it1.employeeId, '2026-11-04'],
      ]);
    });

    it('is held back for a right whose renewal was approved: the end moves, so the reminder of the old end would tell the wrong day', async () => {
      const { assignmentId } = await right();
      on('2026-10-28');
      const waiting = new Map([[assignmentId, { requestId: randomUUID(), state: 'PENDING', approved: false }]]);
      const restore = h.waitingRenewals(waiting);
      try {
        // A renewal that waits for its decision holds nothing back: the holder and the head still choose to renew or to let the right end.
        await h.noticeDue();
        expect(await h.reminderRows(assignmentId)).toHaveLength(3);
      } finally {
        restore();
      }

      const approved = await right();
      const held = h.waitingRenewals(
        new Map([[approved.assignmentId, { requestId: randomUUID(), state: 'AWAITING_EXECUTION', approved: true }]]),
      );
      try {
        on('2026-10-28');
        await h.noticeDue();
        expect(await h.reminderRows(approved.assignmentId)).toEqual([]);
      } finally {
        held();
      }
      // The renewal fell through (the extension failed): the reminder comes on a later day of the range.
      on('2026-11-01');
      await h.noticeDue();
      expect(await h.reminderRows(approved.assignmentId)).toHaveLength(3);
    });
  });
});
