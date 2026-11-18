import { randomUUID } from 'node:crypto';
import { SlaHarness } from '../../support/sla-harness';
import type { Unit } from '../../support/spend-harness';

const h = new SlaHarness();
const CHECK = '23514';
const UNIQUE = '23505';
const APPEND_ONLY = '23001';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('what the database refuses about reminders, incidents and the clock of the queue (US-05-09, US-05-10)', () => {
  let unit: Unit;
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    unit = await h.departmentWithHead('P-SC');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const held = async () => {
    counter += 1;

    return h.sent(await h.staff(unit.department, `SC-E${counter}`), plan);
  };
  const insertReminder = `INSERT INTO step_sla_reminders
      (id, organization_id, request_id, subject_kind, subject_id, step_kind, business_date, sequence, holder_employee_id,
       due_at, age_working_days, overdue_working_days)
    VALUES ($1, $2, $3, $4::"SlaSubjectKind", $5, $6::"AccessRequestStepKind", $7::date, $8, $9, now(), $10, $11)`;
  const reminderValues = (
    requestId: string,
    over: Partial<{
      id: string;
      kind: string;
      subject: string;
      stepKind: string | null;
      date: string;
      sequence: number;
      age: number;
      overdue: number;
    }> = {},
  ) => [
    over.id ?? randomUUID(),
    h.seed.organizationId,
    requestId,
    over.kind ?? 'STEP',
    over.subject ?? requestId,
    over.stepKind === undefined ? 'NEED' : over.stepKind,
    over.date ?? '2026-11-02',
    over.sequence ?? 1,
    unit.head.employeeId,
    over.age ?? 3,
    over.overdue ?? 1,
  ];

  describe('the reminders', () => {
    it('is one for a subject on a day (23505) and one for a number (23505); another day and the next number are fine', async () => {
      const { id } = await held();

      expect(await sqlState(insertReminder, reminderValues(id))).toBeNull();
      expect(await sqlState(insertReminder, reminderValues(id, { sequence: 2 }))).toBe(UNIQUE);
      expect(await sqlState(insertReminder, reminderValues(id, { date: '2026-11-03' }))).toBe(UNIQUE);
      expect(await sqlState(insertReminder, reminderValues(id, { date: '2026-11-03', sequence: 2 }))).toBeNull();
    });

    it('names the kind of step for a step and none for the queue, and refuses a number below one and a negative age (23514)', async () => {
      const { id } = await held();

      expect(await sqlState(insertReminder, reminderValues(id, { stepKind: null }))).toBe(CHECK);
      expect(await sqlState(insertReminder, reminderValues(id, { kind: 'SPEND_QUEUE' }))).toBe(CHECK);
      expect(await sqlState(insertReminder, reminderValues(id, { kind: 'SPEND_QUEUE', stepKind: null }))).toBeNull();
      expect(await sqlState(insertReminder, reminderValues(id, { subject: randomUUID(), sequence: 0 }))).toBe(CHECK);
      expect(await sqlState(insertReminder, reminderValues(id, { subject: randomUUID(), age: -1 }))).toBe(CHECK);
      expect(await sqlState(insertReminder, reminderValues(id, { subject: randomUUID(), overdue: -1 }))).toBe(CHECK);
    });

    it('is kept as it was sent, with the people it went to: nothing edits, deletes or truncates either (23001)', async () => {
      const { id } = await held();
      const reminderId = randomUUID();
      await h.ctx.sql.query(insertReminder, reminderValues(id, { id: reminderId }));
      await h.ctx.sql.query(
        `INSERT INTO step_sla_reminder_recipients (reminder_id, employee_id, role) VALUES ($1, $2, 'HOLDER'::"SlaReminderRole")`,
        [reminderId, unit.head.employeeId],
      );

      for (const statement of [
        `UPDATE step_sla_reminders SET sequence = 9 WHERE id = $1`,
        `DELETE FROM step_sla_reminders WHERE id = $1`,
      ]) {
        expect(await sqlState(statement, [reminderId])).toBe(APPEND_ONLY);
      }
      for (const statement of [
        `UPDATE step_sla_reminder_recipients SET role = 'SUPERIOR'::"SlaReminderRole" WHERE reminder_id = $1`,
        `DELETE FROM step_sla_reminder_recipients WHERE reminder_id = $1`,
      ]) {
        expect(await sqlState(statement, [reminderId])).toBe(APPEND_ONLY);
      }
      expect(await sqlState(`TRUNCATE step_sla_reminders CASCADE`)).toBe(APPEND_ONLY);
      expect(await sqlState(`TRUNCATE step_sla_reminder_recipients`)).toBe(APPEND_ONLY);
    });

    it('names a person once for a reminder (23505)', async () => {
      const { id } = await held();
      const reminderId = randomUUID();
      await h.ctx.sql.query(insertReminder, reminderValues(id, { id: reminderId }));
      const insertRecipient = `INSERT INTO step_sla_reminder_recipients (reminder_id, employee_id, role) VALUES ($1, $2, $3::"SlaReminderRole")`;

      expect(await sqlState(insertRecipient, [reminderId, unit.head.employeeId, 'HOLDER'])).toBeNull();
      expect(await sqlState(insertRecipient, [reminderId, unit.head.employeeId, 'SUPERIOR'])).toBe(UNIQUE);
    });

    it('QĐ-100j: takes the requester as a recipient of a reminder, beside the holder', async () => {
      const { id } = await held();
      const reminderId = randomUUID();
      await h.ctx.sql.query(insertReminder, reminderValues(id, { id: reminderId }));
      const insertRecipient = `INSERT INTO step_sla_reminder_recipients (reminder_id, employee_id, role) VALUES ($1, $2, $3::"SlaReminderRole")`;

      expect(await sqlState(insertRecipient, [reminderId, unit.head.employeeId, 'HOLDER'])).toBeNull();
      expect(await sqlState(insertRecipient, [reminderId, unit.member.employeeId, 'REQUESTER'])).toBeNull();
    });
  });

  describe('the incidents', () => {
    const insertIncident = `INSERT INTO congestion_incidents
        (id, organization_id, holder_employee_id, description, open_steps, oldest_age_working_days, recorded_by_app_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`;
    const incidentValues = (description: string, openSteps = 3, age = 2) => [
      randomUUID(),
      h.seed.organizationId,
      null,
      description,
      openSteps,
      age,
      randomUUID(),
    ];

    it('needs a description that is not blank and has at most 1000 characters, and a snapshot that is not negative (23514)', async () => {
      expect(await sqlState(insertIncident, incidentValues('Steps wait'))).toBeNull();
      expect(await sqlState(insertIncident, incidentValues('x'.repeat(1000)))).toBeNull();
      expect(await sqlState(insertIncident, incidentValues('   '))).toBe(CHECK);
      expect(await sqlState(insertIncident, incidentValues(''))).toBe(CHECK);
      expect(await sqlState(insertIncident, incidentValues('x'.repeat(1001)))).toBe(CHECK);
      expect(await sqlState(insertIncident, incidentValues('Steps wait', -1))).toBe(CHECK);
      expect(await sqlState(insertIncident, incidentValues('Steps wait', 3, -1))).toBe(CHECK);
    });

    it('is kept as it was written: nothing edits, deletes or truncates it (23001)', async () => {
      await h.ctx.sql.query(insertIncident, incidentValues('Kept'));

      expect(await sqlState(`UPDATE congestion_incidents SET open_steps = 1`)).toBe(APPEND_ONLY);
      expect(await sqlState(`DELETE FROM congestion_incidents`)).toBe(APPEND_ONLY);
      expect(await sqlState(`TRUNCATE congestion_incidents`)).toBe(APPEND_ONLY);
    });
  });

  describe('the moment a request entered the queue of its head', () => {
    const queuedAt = async (id: string): Promise<Date | null> =>
      (
        await h.ctx.sql.query<{ spend_queued_at: Date | null }>(
          `SELECT spend_queued_at FROM access_requests WHERE id = $1`,
          [id],
        )
      ).rows[0].spend_queued_at;
    const setState = (id: string, state: string) =>
      h.ctx.sql.query(`UPDATE access_requests SET state = $2::"AccessRequestState" WHERE id = $1`, [id, state]);

    it('is empty for a request that never was in the queue', async () => {
      const { id } = await held();

      expect(await queuedAt(id)).toBeNull();
    });

    it('is set when the request enters the queue, kept while it stays and when it leaves, and set again when it enters again', async () => {
      const { id } = await held();
      await setState(id, 'AWAITING_SPEND_SUBMISSION');
      const first = await queuedAt(id);
      expect(first).toBeInstanceOf(Date);

      // Staying: a change that is not of the state leaves it, and so does the same state again.
      await h.ctx.sql.query(`UPDATE access_requests SET business_reason = 'Changed' WHERE id = $1`, [id]);
      await setState(id, 'AWAITING_SPEND_SUBMISSION');
      expect(await queuedAt(id)).toEqual(first);

      // Leaving does not clear it: the wait of a request that went on can still be measured.
      // (Left for the step of the approver: the state of waiting for Finance is retired, QĐ-97c.)
      await setState(id, 'AWAITING_SPEND_DECISION');
      expect(await queuedAt(id)).toEqual(first);

      // Entering again starts a new wait.
      await h.ctx.sql.query(`SELECT pg_sleep(0.05)`);
      await setState(id, 'AWAITING_SPEND_SUBMISSION');
      expect((await queuedAt(id))!.getTime()).toBeGreaterThan(first!.getTime());
    });

    it('is set for a row that is inserted already in the queue', async () => {
      const { id } = await held();
      const { rows: columns } = await h.ctx.sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'access_requests' AND column_name NOT IN ('id', 'state', 'spend_queued_at') ORDER BY ordinal_position`,
      );
      const list = columns.map((column) => `"${column.column_name}"`).join(', ');
      const copy = await h.ctx.sql.query<{ id: string; spend_queued_at: Date | null }>(
        `INSERT INTO access_requests (id, state, ${list})
         SELECT gen_random_uuid(), 'AWAITING_SPEND_SUBMISSION'::"AccessRequestState", ${list} FROM access_requests WHERE id = $1
         RETURNING id, spend_queued_at`,
        [id],
      );

      expect(copy.rows[0].spend_queued_at).toBeInstanceOf(Date);
    });

    it('has the two partial indexes the pass of the reminders reads', async () => {
      const { rows } = await h.ctx.sql.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE indexname IN ('access_request_steps_open_created_at_idx', 'access_requests_spend_queue_idx')`,
      );

      expect(rows.map((row) => row.indexname).sort()).toEqual([
        'access_request_steps_open_created_at_idx',
        'access_requests_spend_queue_idx',
      ]);
      expect(rows.every((row) => row.indexdef.includes('WHERE'))).toBe(true);
    });
  });
});
