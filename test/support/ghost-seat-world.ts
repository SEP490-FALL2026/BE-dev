import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { InternalRulesService } from '../../src/modules/optimization/internal-rules/internal-rules.service';
import type { RuleRunRecord } from '../../src/modules/optimization/rule-run/rule-run.repo';
import { RevocationHarness } from './revocation-harness';

export interface GhostRow {
  id: string;
  group: string;
  state: string;
  close_reason: string | null;
  tier: string | null;
  subscription_id: string | null;
  assignment_id: string | null;
  seat_chain_id: string | null;
  employee_id: string | null;
  department_id: string | null;
  free_seats: number | null;
  counts_toward_vacant_cost: boolean | null;
  revocation_task_id: string | null;
  holder_left_on: string | null;
  superseded_by_id: string | null;
  evidence: Record<string, unknown>;
}

/**
 * The world the rules of wasted seats are judged in (`qd103-ghost-seat-g1-g2`; reused by `g3-g4` and `manager-decision`): an
 * installation with an IT Admin in charge of a department, subscriptions of the kinds the rules tell apart, seats made in bulk, people
 * who leave, and a run of the rules on a day the test names. Every day a test asks for is a different one (`nextDay`), so each run claims
 * its own period. No assertion lives here.
 */
export class GhostSeatWorld extends RevocationHarness {
  private day = 0;
  private bulk = 0;
  /** The department the seats of the world belong to, and the IT Admin in charge of it (an account that can sign in). */
  worldDepartment = '';
  worldItAdmin = { employeeId: '', account: this.it1 };

  /** Boots the application and an IT Admin in charge of a department that owns the subscriptions of the world. */
  async startWorld(): Promise<void> {
    await this.start();
    const itAdminEmployee = await this.person('E-WORLD-IT');
    const account = await this.account('E-WORLD-IT', itAdminEmployee, 'IT_ADMIN');
    const department = await this.department('P-WORLD', itAdminEmployee);
    this.worldDepartment = department.id;
    this.worldItAdmin = { employeeId: itAdminEmployee, account };
  }

  /** A day not used before: one more than the last, counted from tomorrow, as an instant at noon of the organization's calendar. */
  nextDay(): Date {
    this.day += 1;

    return this.dayOf(this.day);
  }

  dayOf(offsetFromToday: number): Date {
    const instant = new Date();
    instant.setUTCHours(5, 0, 0, 0);
    instant.setUTCDate(instant.getUTCDate() + offsetFromToday);

    return instant;
  }

  /** A subscription of the world's department with seats bought, of a kind and a pricing; flat rate when `quantity` is null. */
  worldSubscription(quantity: number | null, type: 'K1' | 'K2' | 'K4' = 'K2'): Promise<string> {
    return this.subscription(quantity, type, this.worldDepartment);
  }

  /** `count` seats on a subscription, made by one statement (people `prefix0…`, placed in the seed department). */
  async fillSeats(subscriptionId: string, count: number, prefix?: string): Promise<string[]> {
    const tag = prefix ?? `W${(this.bulk += 1)}X`;
    await this.crowd(tag, count);
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, owning_department_id, created_by_app_user_id)
       SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, e.id, e.work_email, e.work_email,
              '2026-01-05', 'RECORDED', s.owner_department_id, $3::uuid
         FROM subscriptions s JOIN employees e ON e.employee_code LIKE $2 || '%' WHERE s.id = $1
       RETURNING id`,
      [subscriptionId, tag, randomUUID()],
    );

    return rows.map((row) => row.id);
  }

  /** One seat of a new person on a subscription, owned by the department of the subscription; returns the person and the assignment. */
  async leaverSeat(subscriptionId: string, code: string): Promise<{ employeeId: string; assignmentId: string }> {
    const assignmentId = await this.seat({ subscriptionId }, code);
    const { rows } = await this.ctx.sql.query<{ employee_id: string }>(
      `SELECT employee_id FROM license_assignments WHERE id = $1`,
      [assignmentId],
    );
    await this.ctx.sql.query(
      `UPDATE license_assignments SET owning_department_id = $2 WHERE id = $1 AND owning_department_id IS NULL`,
      [assignmentId, this.worldDepartment],
    );

    return { employeeId: rows[0].employee_id, assignmentId };
  }

  /** The person has left (`EmployeeStatus.TERMINATED`), the way the record of a departure leaves it. */
  async leave(employeeId: string): Promise<void> {
    await this.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [employeeId]);
  }

  rules = (): InternalRulesService => this.ctx.app.get(InternalRulesService);

  /** The run of the rules for the day (a new one unless `day` is given). */
  runRules(day: Date = this.nextDay()): Promise<RuleRunRecord | null> {
    return this.rules().run(day);
  }

  async ghostRows(where = 'TRUE', values: unknown[] = []): Promise<GhostRow[]> {
    return (
      await this.ctx.sql.query<GhostRow>(
        `SELECT id, "group", state, close_reason, tier, subscription_id, assignment_id, seat_chain_id, employee_id, department_id,
                free_seats, counts_toward_vacant_cost, revocation_task_id, to_char(holder_left_on, 'YYYY-MM-DD') AS holder_left_on,
                superseded_by_id, evidence
           FROM ghost_seat_recommendations WHERE ${where} ORDER BY created_at, id`,
        values,
      )
    ).rows;
  }

  async g1Of(subscriptionId: string): Promise<GhostRow[]> {
    return this.ghostRows(`"group" = 'G1' AND subscription_id = $1`, [subscriptionId]);
  }

  async g2Of(employeeId: string): Promise<GhostRow[]> {
    return this.ghostRows(`"group" = 'G2' AND employee_id = $1`, [employeeId]);
  }

  async skipsOf(runId: string, subjectId?: string) {
    return (
      await this.ctx.sql.query<{
        subject_type: string;
        subject_id: string;
        gate: string;
        detail: Record<string, unknown>;
      }>(
        `SELECT subject_type, subject_id, gate, detail FROM ghost_seat_rule_skips
          WHERE run_id = $1 AND ($2::uuid IS NULL OR subject_id = $2) ORDER BY subject_id`,
        [runId, subjectId ?? null],
      )
    ).rows;
  }

  async noticesOf(code: string, recipientEmployeeId?: string) {
    return (
      await this.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown>; event_key: string }>(
        `SELECT recipient_employee_id, params, event_key FROM in_app_notifications
          WHERE code = $1 AND ($2::uuid IS NULL OR recipient_employee_id = $2) ORDER BY created_at, id`,
        [code, recipientEmployeeId ?? null],
      )
    ).rows;
  }

  /**
   * A recommendation another rule set (or an earlier run) already made for a seat, written as a row: what the replacement and the
   * `holder_left_on` cases of `G2` start from. The chain is the seat itself (a baseline seat has no predecessor).
   */
  async seedRecommendation(input: {
    group: 'G1' | 'G2' | 'G3' | 'G4';
    state: 'OPEN' | 'PAUSED' | 'RECLAIM_DECIDED' | 'CLOSED';
    tier?: 'MONITOR' | 'REVIEW' | 'ACTION' | null;
    assignmentId: string;
    closeReason?: string;
    createdAt?: Date;
    revocationTaskId?: string;
    supersededById?: string;
  }): Promise<string> {
    const { rows: seat } = await this.ctx.sql.query<{
      employee_id: string;
      plan_id: string;
      application_id: string;
      subscription_id: string | null;
    }>(
      `SELECT a.employee_id, a.plan_id, p.application_id, a.subscription_id
         FROM license_assignments a JOIN plans p ON p.id = a.plan_id WHERE a.id = $1`,
      [input.assignmentId],
    );
    const runId = await this.anyRun();
    const id = randomUUID();
    await this.ctx.sql.query(
      `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, close_reason, tier, application_id, plan_id,
         subscription_id, assignment_id, seat_chain_id, employee_id, evidence, created_run_id, created_at, closed_at, revocation_task_id, superseded_by_id)
       VALUES ($1, $2, $3::"GhostSeatGroup", $4::"GhostSeatState", $5::"GhostSeatCloseReason", $6::"GhostSeatTier", $7, $8, $9, $10, $10,
         $11, $16::jsonb, $12, COALESCE($13::timestamptz, now()), $14, $15, $17)`,
      [
        id,
        this.seed.organizationId,
        input.group,
        input.state,
        input.closeReason ?? null,
        input.group === 'G1' ? null : (input.tier ?? 'MONITOR'),
        seat[0].application_id,
        seat[0].plan_id,
        seat[0].subscription_id,
        input.assignmentId,
        seat[0].employee_id,
        runId,
        input.createdAt ?? null,
        input.state === 'CLOSED' ? new Date() : null,
        input.revocationTaskId ?? null,
        JSON.stringify(
          input.group === 'G2'
            ? {
                group: 'G2',
                employeeId: seat[0].employee_id,
                leftOn: null,
                planId: seat[0].plan_id,
                provisioningType: 'K2',
                terminatingAccess: null,
              }
            : { group: input.group },
        ),
        input.supersededById ?? null,
      ],
    );

    return id;
  }

  /** A run row to hang seeded recommendations on (made once, with a period no rule asks for). */
  async anyRun(): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `INSERT INTO ghost_seat_rule_runs (organization_id, rule_set, period_key, status, finished_at)
       VALUES ($1, 'G3_G4', 'seeded', 'COMPLETED', now())
       ON CONFLICT (organization_id, rule_set, period_key) DO UPDATE SET status = 'COMPLETED' RETURNING id`,
      [this.seed.organizationId],
    );

    return rows[0].id;
  }

  /** A seat of a person on a plan with no subscription (internal software), made through the baseline of the plan. */
  async internalSeat(code: string): Promise<{ employeeId: string; assignmentId: string }> {
    const planId = await this.plan('K5');
    const assignmentId = await this.seat({ planId }, code);
    const { rows } = await this.ctx.sql.query<{ employee_id: string }>(
      `SELECT employee_id FROM license_assignments WHERE id = $1`,
      [assignmentId],
    );

    return { employeeId: rows[0].employee_id, assignmentId };
  }

  /** The revocation tasks a seat has, whatever their state. */
  async revocationTasksOf(assignmentId: string): Promise<{ id: string; status: string }[]> {
    return (
      await this.ctx.sql.query<{ id: string; status: string }>(
        `SELECT id, status FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE' ORDER BY created_at, id`,
        [assignmentId],
      )
    ).rows;
  }

  /** The Super Admin sets the schedule of the rule (`RULE_SCHEDULE_G1_G2`) through the operating parameters. */
  setSchedule = (value: 'DAILY' | 'WEEKLY') =>
    request(this.server())
      .put('/api/v1/operating-parameters/RULE_SCHEDULE_G1_G2')
      .set({ Authorization: `Bearer ${this.admin}` })
      .send({ value });
}
