import { SlaHarness } from '../../support/sla-harness';
import type { Unit } from '../../support/spend-harness';

const h = new SlaHarness();
const M = 1_000_000;
const WAIT = 'SPEND_SUBMISSION_WAIT_WORKING_DAYS';

/** Days are counted from a Friday three weeks ahead, so that the data of the organization (written today) is in force. */
const BASE = ((): string => {
  const date = new Date(`${h.today()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 21);
  while (date.getUTCDay() !== 5) date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
})();
const day = (offset: number): string => {
  const date = new Date(`${BASE}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
};
const at = (offset: number, localTime: string): Date => new Date(`${day(offset)}T${localTime}:00.000+07:00`);

describe('the reminder of a request that waits too long in the queue of its head, over PostgreSQL (US-05-09 AC-11, FR-3.21)', () => {
  let paid: string;
  let superAdmin: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(40));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    superAdmin = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM app_users u JOIN role_grants g ON g.app_user_id = u.id
          WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].employee_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const scene = async (): Promise<Unit> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-Q${counter}`);
    await h.budgetFor(unit, { total: 100 * M });

    return unit;
  };
  /** A request the head approved and has not sent on: it waits in the queue. */
  const queued = async (unit: Unit, queuedAt: Date): Promise<string> => {
    const id = await h.paidRequest(unit, paid, { amount: 5 * M });
    expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    await h.queuedAt(id, queuedAt);

    return id;
  };
  const counts = async (requestId: string) => ({
    steps: await h.stepCount(requestId),
    batches: await h.count('spend_batches'),
    mails: await h.emailRows(),
  });

  it('reminds the head of a request three working days in the queue with two to wait, and sends nothing on: no step, no batch, no mail', async () => {
    const unit = await scene();
    const id = await queued(unit, at(0, '16:00'));
    const before = await counts(id);

    const result = await h.sweepAt(at(5, '10:00'));

    expect(result.queueReminded).toBeGreaterThanOrEqual(1);
    const [reminder, ...more] = await h.remindersOf(id);
    expect(more).toEqual([]);
    expect(reminder).toMatchObject({
      subject_kind: 'SPEND_QUEUE',
      step_kind: null,
      sequence: 1,
      holder_employee_id: unit.head.employeeId,
      age_working_days: 3,
      overdue_working_days: 1,
    });
    expect(reminder.recipients).toEqual([{ employee_id: unit.head.employeeId, role: 'HOLDER' }]);
    const [notice] = (await h.noticesOf(unit.head.employeeId, 'SPEND_QUEUE_REMINDER')).filter(
      (n) => n.subject_id === id,
    );
    expect(notice.params).toEqual({
      requestId: id,
      reminderNumber: 1,
      ageWorkingDays: 3,
      overdueWorkingDays: 1,
      cause: null,
    });
    // Nobody above the head is told, and the request is still in the queue as it was.
    expect(await h.noticesOf(h.boss.employeeId, 'SPEND_QUEUE_REMINDER')).toEqual([]);
    expect(await counts(id)).toEqual(before);
    expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    const [event] = await h.audit('ACCESS_REQUEST.STEP_REMINDED', id);
    expect(event).toMatchObject({ actor_kind: 'SYSTEM', after: { subjectKind: 'SPEND_QUEUE', stepKind: null } });
  });

  it('counts the days from the parameter of the day the request entered the queue: a change applies only to what enters after it', async () => {
    const unit = await scene();
    const before = await queued(unit, at(0, '16:00'));
    await h.parameterFrom(WAIT, 3, at(1, '09:00'));
    try {
      const after = await queued(unit, at(3, '09:00'));
      // Wednesday 10:00: the first waited three working days with two to wait; the second two days with three to wait.
      await h.sweepAt(at(5, '10:00'));

      expect(await h.remindersOf(before)).toHaveLength(1);
      expect(await h.remindersOf(after)).toEqual([]);
      // Thursday 10:00 is three days after the second entered it, the deadline of the new value (Thursday 09:00).
      await h.sweepAt(at(6, '10:00'));
      const [reminder] = await h.remindersOf(after);
      expect(reminder).toMatchObject({ age_working_days: 3, overdue_working_days: 0 });
      expect(reminder.due_at).toEqual(at(6, '09:00'));
    } finally {
      await h.parameterFrom(WAIT, 2, at(2, '09:00'));
    }
  });

  it('is done once a working day while it waits, and not after the request has gone on', async () => {
    const unit = await scene();
    const id = await queued(unit, at(0, '16:00'));

    await h.sweepAt(at(5, '10:00'));
    await h.sweepAt(at(5, '15:00'));
    await h.sweepAt(at(6, '10:00'));
    expect((await h.remindersOf(id)).map((reminder) => reminder.sequence)).toEqual([1, 2]);

    await h.sendOn([id], unit.head.account).expect(201);
    await h.sweepAt(at(7, '10:00'));
    expect(await h.remindersOf(id)).toHaveLength(2);
  });

  it('tells the Super Admin when the department has no head any more, with the cause, and no error', async () => {
    const unit = await scene();
    const id = await queued(unit, at(0, '16:00'));
    await h.leave(unit.head.employeeId, { announce: false });

    const result = await h.sweepAt(at(5, '10:00'));

    expect(result.failed).toBe(0);
    const [reminder] = await h.remindersOf(id);
    expect(reminder.recipients).toEqual([{ employee_id: superAdmin, role: 'SUPER_ADMIN' }]);
    const [notice] = (await h.noticesOf(superAdmin, 'SPEND_QUEUE_REMINDER')).filter((n) => n.subject_id === id);
    expect(notice.params).toMatchObject({ cause: 'NO_HOLDER', requestId: id });
    expect(await h.noticesOf(unit.head.employeeId, 'SPEND_QUEUE_REMINDER')).toEqual([]);
  });

  it('shows the head since when each request waits, how long, whether it is late, and how many reminders there were', async () => {
    const unit = await scene();
    const old = await queued(unit, new Date('2026-08-03T09:00:00.000+07:00'));
    const fresh = await queued(unit, new Date());
    await h.sweepAt(new Date());

    const response = await h.spendQueue(unit.head.account, { pageSize: 50 }).expect(200);

    const items = h.dataOf<{
      items: {
        requestId: string;
        queuedAt: string | null;
        waitedWorkingDays: number;
        overdue: boolean;
        reminders: number;
      }[];
    }>(response).items;
    const oldItem = items.find((item) => item.requestId === old);
    const freshItem = items.find((item) => item.requestId === fresh);
    expect(oldItem).toMatchObject({ overdue: true, reminders: (await h.remindersOf(old)).length });
    expect(oldItem?.waitedWorkingDays).toBeGreaterThan(30);
    expect(oldItem?.queuedAt).toBe('2026-08-03T02:00:00.000Z');
    expect(freshItem).toMatchObject({ waitedWorkingDays: 0, overdue: false, reminders: 0 });
    expect(freshItem?.queuedAt).not.toBeNull();
  });
});
