import request from 'supertest';
import { StepSlaSweepService, type StepSlaSweepResult } from '../../src/modules/requests/step-sla-sweep.service';
import { StatusHarness } from './status-harness';

/** A reminder as the database keeps it, with the people it went to. */
export interface ReminderRow {
  id: string;
  request_id: string;
  subject_kind: string;
  subject_id: string;
  step_kind: string | null;
  business_date: string;
  sequence: number;
  holder_employee_id: string | null;
  due_at: Date;
  age_working_days: number;
  overdue_working_days: number;
  recipients: { employee_id: string; role: string }[];
}

/**
 * The status harness with what the reminders of the late steps need: steps and queue entries made to have begun at a moment the
 * test chooses (the clock of the step runs from its creation), days off written the way the past is (no route adds one), a sweep run
 * at a moment the test gives, and the reminders, the notices and the rows of a step read back. No assertion lives here.
 */
export class SlaHarness extends StatusHarness {
  private sweeper = () => this.ctx.app.get(StepSlaSweepService, { strict: false });

  /** One pass of the worker at `now`. */
  sweepAt = (now: Date): Promise<StepSlaSweepResult> => this.sweeper().sweep(now);

  /** The open step of the request began at `createdAt` (and was given at the same moment): the clock of its SLA starts there. */
  async beganAt(requestId: string, kind: string, createdAt: Date): Promise<void> {
    await this.ctx.sql.query(
      `UPDATE access_request_steps
          SET created_at = $3::timestamptz, assigned_at = CASE WHEN assigned_at IS NULL THEN NULL ELSE $3::timestamptz END
        WHERE request_id = $1 AND kind = $2::"AccessRequestStepKind" AND state IN ('PENDING', 'WAITING')`,
      [requestId, kind, createdAt],
    );
    await this.ctx.sql.query(
      `UPDATE access_request_steps SET waiting_since = $3::timestamptz
        WHERE request_id = $1 AND kind = $2::"AccessRequestStepKind" AND state = 'WAITING'`,
      [requestId, kind, createdAt],
    );
  }

  /** The request entered the queue of its head at `queuedAt`. Only this column is written, so the trigger of the state does not run. */
  async queuedAt(requestId: string, queuedAt: Date): Promise<void> {
    await this.ctx.sql.query(`UPDATE access_requests SET spend_queued_at = $2 WHERE id = $1`, [requestId, queuedAt]);
  }

  /** `date` is a day nobody works: written to the table, as a past day is (the routes refuse one). */
  async dayOff(date: string, reason = 'Day off'): Promise<void> {
    await this.ctx.sql.query(
      `INSERT INTO non_working_dates (id, organization_id, date, reason) VALUES (gen_random_uuid(), $1, $2::date, $3)
       ON CONFLICT DO NOTHING`,
      [this.seed.organizationId, date, reason],
    );
  }

  /** A parameter has this value from `from` on, the one before it ending there. */
  async parameterFrom(key: string, value: unknown, from: Date): Promise<void> {
    await this.ctx.sql.query(`UPDATE parameter_values SET valid_to = $2 WHERE key = $1 AND valid_to IS NULL`, [
      key,
      from,
    ]);
    await this.ctx.sql.query(
      `INSERT INTO parameter_values (id, organization_id, key, value, valid_from) VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4)`,
      [this.seed.organizationId, key, JSON.stringify(value), from],
    );
  }

  /** The reminders of a step, or of a request in the queue, oldest first, each with the people it went to. */
  async remindersOf(subjectId: string): Promise<ReminderRow[]> {
    const { rows } = await this.ctx.sql.query<ReminderRow>(
      `SELECT r.id, r.request_id, r.subject_kind::text, r.subject_id, r.step_kind::text, r.business_date::text, r.sequence,
              r.holder_employee_id, r.due_at, r.age_working_days, r.overdue_working_days,
              coalesce((SELECT json_agg(json_build_object('employee_id', p.employee_id, 'role', p.role::text) ORDER BY p.role::text, p.employee_id)
                          FROM step_sla_reminder_recipients p WHERE p.reminder_id = r.id), '[]') AS recipients
         FROM step_sla_reminders r WHERE r.subject_id = $1 ORDER BY r.sequence`,
      [subjectId],
    );

    return rows;
  }

  async reminderCount(): Promise<number> {
    return this.count('step_sla_reminders');
  }

  /** What the sweep must never write: every row of the steps and of the requests, and the tables of the decisions. */
  async decisionState(): Promise<unknown> {
    const read = async (sql: string): Promise<Record<string, unknown>[]> => {
      const result = await this.ctx.sql.query<Record<string, unknown>>(sql);

      return result.rows;
    };

    return {
      steps: await read(`SELECT * FROM access_request_steps ORDER BY id`),
      requests: await read(`SELECT id, state, updated_at, policy FROM access_requests ORDER BY id`),
      approvals: await read(`SELECT * FROM approval_records ORDER BY 1`),
      spendDecisions: await read(`SELECT * FROM spend_decisions ORDER BY 1`),
      commitments: await read(`SELECT * FROM budget_commitments ORDER BY 1`),
    };
  }

  /** How many steps the request has, of any kind and state. */
  async stepCount(requestId: string): Promise<number> {
    const { rows } = await this.ctx.sql.query<{ count: string }>(
      `SELECT count(*) FROM access_request_steps WHERE request_id = $1`,
      [requestId],
    );

    return Number(rows[0].count);
  }

  async emailRows(): Promise<number> {
    return this.count('email_outbox');
  }

  /** Every route that decides a step, called with `token` for the step of the request and the batch: what a person who is not its holder may not do. */
  decisionCalls(requestId: string, batchId: string, token: string): Promise<request.Response>[] {
    const as = { Authorization: `Bearer ${token}` };
    const server = this.server();

    return [
      request(server).post(`/api/v1/access-requests/${requestId}/need-decision`).set(as).send({ decision: 'APPROVE' }),
      request(server).post(`/api/v1/access-requests/${requestId}/spend-approval`).set(as).send({ decision: 'APPROVE' }),
      request(server).post(`/api/v1/access-requests/${requestId}/finance-review`).set(as).send({
        outcome: 'ASSESSED',
        opinion: 'A decision made in the place of Finance',
        direction: 'RECOMMEND_OVERRIDE',
      }),
      request(server)
        .post(`/api/v1/spend-batches/${batchId}/decisions`)
        .set(as)
        .send({ decision: 'APPROVE', requestIds: [requestId] }),
    ];
  }

  /** The Super Admin's own calls of the board. */
  board = (query: Record<string, string | number> = {}, token: string = this.admin) =>
    request(this.server())
      .get('/api/v1/step-congestion')
      .query(query)
      .set({ Authorization: `Bearer ${token}` });
  boardSteps = (query: Record<string, string | number> = {}, token: string = this.admin) =>
    request(this.server())
      .get('/api/v1/step-congestion/steps')
      .query(query)
      .set({ Authorization: `Bearer ${token}` });
  recordIncident = (body: object, token: string = this.admin) =>
    request(this.server())
      .post('/api/v1/step-congestion/incidents')
      .set({ Authorization: `Bearer ${token}` })
      .send(body);
  incidents = (query: Record<string, string | number> = {}, token: string = this.admin) =>
    request(this.server())
      .get('/api/v1/step-congestion/incidents')
      .query(query)
      .set({ Authorization: `Bearer ${token}` });
}
