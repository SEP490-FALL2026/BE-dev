import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import { SlaHarness } from '../../support/sla-harness';
import type { Unit } from '../../support/spend-harness';

const h = new SlaHarness();
const M = 1_000_000;
const APPROVE = { decision: 'APPROVE' };

/**
 * The days of the tests are counted from a Friday three weeks ahead of the day the suite runs: the organization's data (who heads a
 * department, where a person is placed) takes effect from the day it was written, and a reminder asks who is who on the day of the
 * pass, so a pass is made at a moment after it. `day(n)` is n days from that Friday (0 Friday, 3 Monday, 5 Wednesday, 7 Friday).
 * The organization works in Asia/Ho_Chi_Minh (UTC+7).
 */
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
const FRIDAY_16 = at(0, '16:00');

describe('the reminders of a step that is late, over PostgreSQL (US-05-09, US-05-06 AC-10, US-05-10 AC-5)', () => {
  let internal: string;
  let paid: string;
  let financeUnit: Unit;
  let superAdmin: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    internal = await h.plan('K5');
    paid = await h.planOf(await h.subscription(40));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    // Finance sits in a department with its own head, so that the head of that department is the superior of Finance.
    financeUnit = await h.departmentWithHead('P-FIN');
    await h.moveTo(h.finance.employeeId, financeUnit.department.id, { announce: false });
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

    return h.departmentWithHead(`P-S${counter}`);
  };
  /** A request that waits for the head of the department, made to have begun at `began`. */
  const needStepBegunAt = async (began: Date, unit?: Unit) => {
    const u = unit ?? (await scene());
    const sent = await h.sent(u.member, internal);
    await h.beganAt(sent.id, 'NEED', began);

    return { u, id: sent.id, stepId: (await h.stepOf(sent.id, 'NEED')).id };
  };
  const roles = (rows: { employee_id: string; role: string }[]) =>
    rows.map((row) => `${row.employee_id}:${row.role}`).sort();

  describe('the first reminder (AC-1, AC-2, AC-5)', () => {
    it('reminds the holder and the spending approver when a step is three working days old with two to wait, and changes nothing (AC-1, AC-2, AC-5)', async () => {
      const { u, id, stepId } = await needStepBegunAt(FRIDAY_16);
      const before = await h.decisionState();

      const result = await h.sweepAt(at(5, '10:00'));

      expect(result).toMatchObject({ workingDay: true, failed: 0 });
      const [reminder, ...more] = await h.remindersOf(stepId);
      expect(more).toEqual([]);
      expect(reminder).toMatchObject({
        request_id: id,
        subject_kind: 'STEP',
        step_kind: 'NEED',
        business_date: day(5),
        sequence: 1,
        holder_employee_id: u.head.employeeId,
        age_working_days: 3,
        overdue_working_days: 1,
      });
      expect(reminder.due_at).toEqual(at(4, '16:00'));
      expect(roles(reminder.recipients)).toEqual(
        [`${u.head.employeeId}:HOLDER`, `${h.boss.employeeId}:SUPERIOR`].sort(),
      );
      expect(await h.codesFor(u.head.employeeId, id)).toEqual(['STEP_SLA_REMINDER']);
      const [holderNotice] = await h.noticesOf(u.head.employeeId, 'STEP_SLA_REMINDER');
      expect(holderNotice).toMatchObject({
        subject_type: 'ACCESS_REQUEST',
        subject_id: id,
        event_key: `SLA:${reminder.id}`,
        params: { requestId: id, stepKind: 'NEED', reminderNumber: 1, ageWorkingDays: 3, overdueWorkingDays: 1 },
      });
      const escalations = (await h.noticesOf(h.boss.employeeId, 'STEP_SLA_ESCALATION')).filter(
        (notice) => notice.subject_id === id,
      );
      expect(escalations).toHaveLength(1);
      expect(escalations[0].params).toMatchObject({ holderEmployeeId: u.head.employeeId, reminderNumber: 1 });
      expect(JSON.stringify(escalations[0].params)).not.toMatch(/amount|budget|reason/i);
      const [event] = await h.audit('ACCESS_REQUEST.STEP_REMINDED', stepId);
      expect(event).toMatchObject({
        actor_kind: 'SYSTEM',
        after: {
          requestId: id,
          stepKind: 'NEED',
          reminderNumber: 1,
          businessDate: day(5),
          overdueWorkingDays: 1,
        },
      });
      // Nothing of the step, the request or a decision moved: the holder, the state and the time they were given are as they were.
      const after = await h.decisionState();
      expect(after).toEqual(before);
    });

    it('does not remind before the deadline: Monday at 09:00 and Tuesday at 15:59 are inside the two days (AC-6)', async () => {
      const { stepId } = await needStepBegunAt(FRIDAY_16);

      await h.sweepAt(at(3, '09:00'));
      await h.sweepAt(at(4, '15:59'));

      expect(await h.remindersOf(stepId)).toEqual([]);
      await h.sweepAt(at(4, '16:01'));
      expect(await h.remindersOf(stepId)).toEqual([expect.objectContaining({ sequence: 1, age_working_days: 2 })]);
    });

    it('moves the deadline by a day off, even one that was added after the step began (AC-6)', async () => {
      const { stepId } = await needStepBegunAt(at(14, '16:00'));
      // The Monday after the Friday is declared a day off after the step began: two working days later is the Wednesday, not the Tuesday.
      await h.dayOff(day(17), 'Added later');

      await h.sweepAt(at(18, '16:01'));
      expect(await h.remindersOf(stepId)).toEqual([]);
      await h.sweepAt(at(19, '16:01'));
      const [reminder] = await h.remindersOf(stepId);
      expect(reminder.due_at).toEqual(at(19, '16:00'));
    });

    it('reminds the holder of an IT assessment and their own head, and leaves the request where it was (US-05-06 AC-10)', async () => {
      const u = await scene();
      await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
      const proposed = await h.proposed(u.member);
      await h.decide(proposed.id, APPROVE, u.head.account).expect(200);
      const step = await h.stepOf(proposed.id, 'IT_ASSESSMENT');
      expect(step).toMatchObject({ state: 'PENDING', assignee_employee_id: h.it1.employeeId });
      await h.beganAt(proposed.id, 'IT_ASSESSMENT', FRIDAY_16);

      await h.sweepAt(at(5, '10:00'));

      const [reminder] = await h.remindersOf(step.id);
      expect(reminder).toMatchObject({
        step_kind: 'IT_ASSESSMENT',
        age_working_days: 3,
        holder_employee_id: h.it1.employeeId,
      });
      // The IT Admin sits in the seed department, whose head is the superior; nobody there: the Super Admin is told instead.
      expect(reminder.recipients.map((row) => row.role)).toContain('HOLDER');
      expect(await h.stepOf(proposed.id, 'IT_ASSESSMENT')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: h.it1.employeeId,
      });
      expect(await h.state(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    });
  });

  describe('one a working day, and no decision (AC-3, AC-4)', () => {
    it('reminds the spending approver and the Super Admin once each working day of a step ten days late, and decides nothing (AC-3, AC-4)', async () => {
      const u = await scene();
      await h.budgetFor(u, { total: 100 * M });
      const id = await h.waitingForApprover(u, paid, { amount: 5 * M });
      await h.beganAt(id, 'SPEND_APPROVAL', at(-14, '16:00'));
      const stepId = (await h.stepOf(id, 'SPEND_APPROVAL')).id;
      const before = await h.decisionState();

      // Six passes in five working days: Monday to Friday, with two on the Wednesday.
      for (const moment of [
        at(-4, '10:00'),
        at(-3, '10:00'),
        at(-2, '10:00'),
        at(-2, '15:00'),
        at(-1, '10:00'),
        at(0, '10:00'),
      ]) {
        await h.sweepAt(moment);
      }

      const reminders = await h.remindersOf(stepId);
      expect(reminders.map((reminder) => [reminder.sequence, reminder.business_date])).toEqual([
        [1, day(-4)],
        [2, day(-3)],
        [3, day(-2)],
        [4, day(-1)],
        [5, day(0)],
      ]);
      // The spending approver is the holder, nobody is above them: the Super Admin is told, with the reason (AC-4).
      for (const reminder of reminders) {
        expect(roles(reminder.recipients)).toEqual([`${h.boss.employeeId}:HOLDER`, `${superAdmin}:SUPER_ADMIN`].sort());
      }
      const toSuperAdmin = (await h.noticesOf(superAdmin, 'STEP_SLA_NO_SUPERIOR')).filter(
        (notice) => notice.subject_id === id,
      );
      expect(toSuperAdmin).toHaveLength(5);
      expect(toSuperAdmin[0].params).toMatchObject({ cause: 'NO_SUPERIOR', holderEmployeeId: h.boss.employeeId });
      expect((await h.noticesOf(h.boss.employeeId, 'STEP_SLA_ESCALATION')).filter((n) => n.subject_id === id)).toEqual(
        [],
      );
      expect(await h.decisionState()).toEqual(before);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
    });

    it('does not remind on a Saturday, a Sunday or a day off, and no step is looked at', async () => {
      const { stepId } = await needStepBegunAt(FRIDAY_16);
      await h.dayOff(day(34), 'Company day');
      const before = await h.reminderCount();

      expect(await h.sweepAt(at(29, '10:00'))).toMatchObject({ workingDay: false, stepsReminded: 0 });
      await h.sweepAt(at(30, '10:00'));
      await h.sweepAt(at(34, '10:00'));

      expect(await h.reminderCount()).toBe(before);
      expect(await h.remindersOf(stepId)).toEqual([]);
    });
  });

  describe('the superior, whoever holds the step (AC-8, AC-9, AC-10)', () => {
    it('reminds Finance and the head of the department of Finance for a review that is late, with no spend step made (AC-8, AC-10)', async () => {
      const u = await scene();
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const id = await h.paidRequest(u, paid, { amount: 45 * M });
      await h.route(id, u.head.account);
      const step = await h.stepOf(id, 'FINANCE_REVIEW');
      expect(step).toMatchObject({ state: 'PENDING', assignee_employee_id: h.finance.employeeId });
      await h.beganAt(id, 'FINANCE_REVIEW', FRIDAY_16);
      const stepsBefore = await h.stepCount(id);

      await h.sweepAt(at(5, '10:00'));

      const [reminder] = await h.remindersOf(step.id);
      expect(reminder).toMatchObject({ step_kind: 'FINANCE_REVIEW' });
      expect(roles(reminder.recipients)).toEqual(
        [`${h.finance.employeeId}:HOLDER`, `${financeUnit.head.employeeId}:SUPERIOR`].sort(),
      );
      expect(await h.stepOf(id, 'FINANCE_REVIEW')).toMatchObject({
        state: 'PENDING',
        assignee_employee_id: h.finance.employeeId,
      });
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.stepCount(id)).toBe(stepsBefore);
    });

    it('reminds the Super Admin, every working day, of a need step that waits for a head, and leaves the step waiting (AC-9, QĐ-93c)', async () => {
      const headless = await h.departmentWithUnit(`P-NH${(counter += 1)}`);
      const requester = await h.staff(headless, `NH-E${counter}`);
      const sent = await h.sent(requester, internal);
      const step = await h.stepOf(sent.id, 'NEED');
      expect(step).toMatchObject({ state: 'WAITING', assignee_employee_id: null });
      await h.beganAt(sent.id, 'NEED', FRIDAY_16);

      await h.sweepAt(at(5, '10:00'));

      const [reminder] = await h.remindersOf(step.id);
      expect(reminder.holder_employee_id).toBeNull();
      expect(roles(reminder.recipients)).toEqual([`${superAdmin}:SUPER_ADMIN`]);
      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({ assignee_employee_id: null, state: 'WAITING' });
    });
  });

  describe('a step with nobody to hold it, a holder who left, a step that closed', () => {
    it('reminds the Super Admin of a step nobody holds on every working day and leaves the step waiting', async () => {
      const u = await scene();
      await h.budgetFor(u, { total: 100 * M });
      const id = await h.paidRequest(u, paid, { amount: 5 * M });
      // The step waits only while the role is empty: naming the approver again gives it to them, so all of this runs inside.
      await h.clearRole('SPENDING_APPROVER');
      try {
        await h.route(id, u.head.account);
        const step = await h.stepOf(id, 'SPEND_APPROVAL');
        expect(step).toMatchObject({ state: 'WAITING', assignee_employee_id: null });
        await h.beganAt(id, 'SPEND_APPROVAL', at(-14, '16:00'));
        const before = await h.decisionState();

        // Thirty passes over five working days: one reminder a day, and the step and the request are as they were.
        for (const offset of [-4, -3, -2, -1, 0]) {
          for (let pass = 0; pass < 6; pass += 1) await h.sweepAt(at(offset, `${10 + pass}:00`));
        }

        const reminders = await h.remindersOf(step.id);
        expect(reminders).toHaveLength(5);
        expect(reminders.every((reminder) => reminder.holder_employee_id === null)).toBe(true);
        expect(reminders.map((reminder) => roles(reminder.recipients))).toEqual(
          Array(5).fill([`${superAdmin}:SUPER_ADMIN`]),
        );
        const notices = (await h.noticesOf(superAdmin, 'STEP_SLA_NO_SUPERIOR')).filter(
          (notice) => notice.subject_id === id,
        );
        expect(notices).toHaveLength(5);
        expect(notices[0].params).toMatchObject({ cause: 'NO_HOLDER', holderEmployeeId: null });
        expect(await h.decisionState()).toEqual(before);
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });

    it('does not tell a holder who has left, and tells the Super Admin that the holder cannot act', async () => {
      const { u, id, stepId } = await needStepBegunAt(FRIDAY_16);
      await h.leave(u.head.employeeId, { announce: false });

      await h.sweepAt(at(5, '10:00'));

      const [reminder] = await h.remindersOf(stepId);
      expect(roles(reminder.recipients)).toEqual([`${superAdmin}:SUPER_ADMIN`]);
      expect(await h.noticesOf(u.head.employeeId, 'STEP_SLA_REMINDER')).toEqual([]);
      const [notice] = (await h.noticesOf(superAdmin, 'STEP_SLA_NO_SUPERIOR')).filter((n) => n.subject_id === id);
      expect(notice.params).toMatchObject({ cause: 'HOLDER_NOT_USABLE', holderEmployeeId: u.head.employeeId });
      expect(await h.stepOf(id, 'NEED')).toMatchObject({ state: 'PENDING', assignee_employee_id: u.head.employeeId });
    });

    it('stops at once for a step that was decided and for a request that was withdrawn', async () => {
      const decided = await needStepBegunAt(FRIDAY_16);
      await h.decide(decided.id, APPROVE, decided.u.head.account).expect(200);
      const withdrawn = await needStepBegunAt(FRIDAY_16);
      await h.withdrawRequest(withdrawn.id, { reason: 'No longer needed' }, withdrawn.u.member.account).expect(200);
      expect(await h.stepOf(withdrawn.id, 'NEED')).toMatchObject({ state: 'CLOSED' });

      await h.sweepAt(at(5, '10:00'));

      expect(await h.remindersOf(decided.stepId)).toEqual([]);
      expect(await h.remindersOf(withdrawn.stepId)).toEqual([]);
    });
  });

  describe('the holder changes, and two workers meet', () => {
    it('calls the new holder and keeps the number and the deadline when the holder changes between two reminders (US-05-10 AC-5)', async () => {
      const { u, id, stepId } = await needStepBegunAt(FRIDAY_16);
      const other = await h.staff(u.department, `NEW-H${(counter += 1)}`);
      await h.sweepAt(at(5, '10:00'));
      const [first] = await h.remindersOf(stepId);

      await h.ctx.sql.query(
        `UPDATE access_request_steps SET assignee_employee_id = $2, assigned_at = now() WHERE id = $1`,
        [stepId, other.employeeId],
      );
      await h.sweepAt(at(6, '10:00'));

      const [again, second] = await h.remindersOf(stepId);
      expect(again.id).toBe(first.id);
      expect(second).toMatchObject({ sequence: 2, holder_employee_id: other.employeeId, overdue_working_days: 2 });
      expect(second.due_at).toEqual(first.due_at);
      expect(roles(second.recipients)).toContain(`${other.employeeId}:HOLDER`);
      expect(
        (await h.noticesOf(other.employeeId, 'STEP_SLA_REMINDER')).filter((n) => n.subject_id === id),
      ).toHaveLength(1);
    });

    it('makes one reminder and one notice for each person when two passes run at once', async () => {
      const { u, id, stepId } = await needStepBegunAt(FRIDAY_16);

      await Promise.all([h.sweepAt(at(5, '10:00')), h.sweepAt(at(5, '10:00'))]);

      expect(await h.remindersOf(stepId)).toHaveLength(1);
      expect(
        (await h.noticesOf(u.head.employeeId, 'STEP_SLA_REMINDER')).filter((n) => n.subject_id === id),
      ).toHaveLength(1);
      expect(
        (await h.noticesOf(h.boss.employeeId, 'STEP_SLA_ESCALATION')).filter((n) => n.subject_id === id),
      ).toHaveLength(1);
    });

    it('rolls the whole reminder back when a notice fails, and makes it complete on the next pass', async () => {
      const { u, id, stepId } = await needStepBegunAt(FRIDAY_16);
      const notifications = h.ctx.app.get(NotificationsApi, { strict: false });
      const original = notifications.notifyInApp.bind(notifications);
      let calls = 0;
      const spy = jest.spyOn(notifications, 'notifyInApp').mockImplementation((tx, input) => {
        calls += 1;

        return calls % 2 === 0 ? Promise.reject(new Error('inbox is down')) : original(tx, input);
      });
      try {
        const failed = await h.sweepAt(at(5, '10:00'));
        expect(failed.failed).toBeGreaterThan(0);
      } finally {
        spy.mockRestore();
      }

      expect(await h.remindersOf(stepId)).toEqual([]);
      expect((await h.noticesOf(u.head.employeeId, 'STEP_SLA_REMINDER')).filter((n) => n.subject_id === id)).toEqual(
        [],
      );
      expect(await h.audit('ACCESS_REQUEST.STEP_REMINDED', stepId)).toEqual([]);

      await h.sweepAt(at(5, '10:05'));

      expect(await h.remindersOf(stepId)).toHaveLength(1);
      expect(
        (await h.noticesOf(u.head.employeeId, 'STEP_SLA_REMINDER')).filter((n) => n.subject_id === id),
      ).toHaveLength(1);
    });

    it('writes no mail: the sweep leaves the outbox as it was', async () => {
      await needStepBegunAt(FRIDAY_16);
      const mails = await h.emailRows();

      await h.sweepAt(at(5, '10:10'));

      expect(await h.emailRows()).toBe(mails);
    });
  });
});
