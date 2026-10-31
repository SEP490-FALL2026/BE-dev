import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { SlaHarness } from '../../support/sla-harness';
import type { Unit } from '../../support/spend-harness';

const h = new SlaHarness();
const M = 1_000_000;

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

describe('the reminder to Finance of a question that is still open (US-06-02 AC-3)', () => {
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(40));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A request whose spend step is late with the spending approver, who has asked Finance a question. */
  const lateWithQuestion = async (): Promise<{ id: string; stepId: string; questionId: string; unit: Unit }> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-F${counter}`);
    await h.budgetFor(unit, { total: 100 * M });
    const id = await h.waitingForApprover(unit, paid, { amount: 5 * M });
    const questionId = h.dataOf<{ budgetInformation: { id: string } }>(
      await h.askFinance(id, { question: 'Is there room in the budget for this?' }, h.boss.account).expect(201),
    ).budgetInformation.id;
    await h.beganAt(id, 'SPEND_APPROVAL', at(0, '16:00'));

    return { id, stepId: (await h.stepOf(id, 'SPEND_APPROVAL')).id, questionId, unit };
  };
  const roles = (rows: { employee_id: string; role: string }[]) =>
    rows.map((row) => `${row.employee_id}:${row.role}`).sort();

  it('adds Finance to the first reminder while the question is open, without the text of the question or any figure, and changes nothing of the question', async () => {
    const { id, stepId, questionId } = await lateWithQuestion();
    const questionBefore = (
      await h.ctx.sql.query(`SELECT * FROM budget_information_requests WHERE id = $1`, [questionId])
    ).rows;
    const before = await h.decisionState();

    await h.sweepAt(at(5, '10:00'));

    const [reminder] = await h.remindersOf(stepId);
    expect(roles(reminder.recipients)).toEqual(
      [
        `${h.boss.employeeId}:HOLDER`,
        `${h.finance.employeeId}:FINANCE_QUESTION`,
        `${await superAdmin()}:SUPER_ADMIN`,
      ].sort(),
    );
    const [notice] = (await h.noticesOf(h.finance.employeeId, 'FINANCE_QUESTION_REMINDER')).filter(
      (n) => n.subject_id === id,
    );
    expect(notice.params).toEqual({
      requestId: id,
      stepKind: 'SPEND_APPROVAL',
      questionId,
      reminderNumber: 1,
      ageWorkingDays: 3,
      overdueWorkingDays: 1,
    });
    expect(JSON.stringify(notice.params)).not.toMatch(/room in the budget|amount|budget/i);
    expect(
      (await h.ctx.sql.query(`SELECT * FROM budget_information_requests WHERE id = $1`, [questionId])).rows,
    ).toEqual(questionBefore);
    expect(await h.decisionState()).toEqual(before);
  });

  it('does not add Finance once the question is answered, and the holder is still reminded', async () => {
    const { id, stepId, questionId } = await lateWithQuestion();
    await h.answerQuestion(questionId, { answer: 'WITHIN_LIMIT', note: 'There is room' }, h.finance).expect(200);

    await h.sweepAt(at(5, '10:00'));

    const [reminder] = await h.remindersOf(stepId);
    expect(reminder.recipients.map((row) => row.role)).not.toContain('FINANCE_QUESTION');
    expect(reminder.recipients.map((row) => row.employee_id)).toContain(h.boss.employeeId);
    expect(
      (await h.noticesOf(h.finance.employeeId, 'FINANCE_QUESTION_REMINDER')).filter((n) => n.subject_id === id),
    ).toEqual([]);
  });

  it('skips Finance when nobody can act for it, and does not fail', async () => {
    const { stepId } = await lateWithQuestion();
    expect((await h.revokeRoleFrom(h.finance.appUserId, 'FINANCE')).status).toBeLessThan(300);
    try {
      const result = await h.sweepAt(at(5, '10:00'));

      expect(result.failed).toBe(0);
      const [reminder] = await h.remindersOf(stepId);
      expect(reminder.recipients.map((row) => row.role)).not.toContain('FINANCE_QUESTION');
      expect(reminder.recipients.map((row) => row.role)).toContain('HOLDER');
    } finally {
      expect((await h.grantRoleTo(h.finance.appUserId, 'FINANCE')).status).toBeLessThan(300);
    }
  });

  it('names a person once when Finance holds the step itself', async () => {
    const { id, stepId } = await lateWithQuestion();
    await h.ctx.sql.query(`UPDATE access_request_steps SET assignee_employee_id = $2 WHERE id = $1`, [
      stepId,
      h.finance.employeeId,
    ]);

    await h.sweepAt(at(5, '10:00'));

    const [reminder] = await h.remindersOf(stepId);
    const people = reminder.recipients.map((row) => row.employee_id);
    expect(new Set(people).size).toBe(people.length);
    expect(reminder.recipients.filter((row) => row.employee_id === h.finance.employeeId)).toEqual([
      { employee_id: h.finance.employeeId, role: 'HOLDER' },
    ]);
    expect(
      (await h.noticesOf(h.finance.employeeId, 'FINANCE_QUESTION_REMINDER')).filter((n) => n.subject_id === id),
    ).toEqual([]);
  });

  it('adds Finance only to the reminder of a step with a question: another late step does not', async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-F${counter}`);
    await h.budgetFor(unit, { total: 100 * M });
    const id = await h.waitingForApprover(unit, paid, { amount: 5 * M });
    await h.beganAt(id, 'SPEND_APPROVAL', at(0, '16:00'));

    await h.sweepAt(at(5, '10:00'));

    const [reminder] = await h.remindersOf((await h.stepOf(id, 'SPEND_APPROVAL')).id);
    expect(reminder.recipients.map((row) => row.role)).not.toContain('FINANCE_QUESTION');
  });

  it('finds the Super Admin who can act, and nobody when the account is locked (the lookup the reminders to the Super Admin rely on)', async () => {
    const identity = h.ctx.app.get(IdentityAccessApi, { strict: false });
    const expected = await superAdmin();
    counter += 1;
    const unit = await h.departmentWithHead(`P-F${counter}`);
    await h.budgetFor(unit, { total: 100 * M });
    const id = await h.waitingForApprover(unit, paid, { amount: 5 * M });
    await h.beganAt(id, 'SPEND_APPROVAL', at(0, '16:00'));

    expect(await identity.findUsableSuperAdminEmployeeId()).toBe(expected);
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED'::"AppUserStatus" WHERE employee_id = $1`, [expected]);
    try {
      expect(await identity.findUsableSuperAdminEmployeeId()).toBeNull();
      // With nobody to tell, the reminder is still recorded and told to nobody else.
      await h.sweepAt(at(5, '10:00'));
      const [reminder] = await h.remindersOf((await h.stepOf(id, 'SPEND_APPROVAL')).id);
      expect(reminder.recipients).toEqual([{ employee_id: h.boss.employeeId, role: 'HOLDER' }]);
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE'::"AppUserStatus" WHERE employee_id = $1`, [
        expected,
      ]);
    }
    expect(await identity.findUsableSuperAdminEmployeeId()).toBe(expected);
  });

  const superAdmin = async (): Promise<string> =>
    (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM app_users u JOIN role_grants g ON g.app_user_id = u.id
          WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].employee_id;
});
