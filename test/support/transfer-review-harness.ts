import request from 'supertest';
import { TransferReviewOverdueService } from '../../src/modules/personnel/transfer-review/transfer-review-overdue.service';
import type { ApiAccount } from './api-accounts';
import { SeatRevocationHarness } from './seat-revocation-harness';
import type { Department, Person } from './request-harness';

export interface ReviewWire {
  id: string;
  employee: { id: string; employeeCode: string; fullName: string };
  department: { id: string; code: string; name: string };
  origin: 'TRANSFER' | 'POST_SETUP';
  effectiveOn: string;
  dueOn: string;
  status: 'OPEN' | 'COMPLETED' | 'SUPERSEDED';
  totalItems: number;
  pendingItems: number;
  waitingReason: 'NO_HEAD' | null;
  overdue: boolean;
  overdueDays: number;
  canDecide: boolean;
  reviewer?: { id: string } | null;
  transferId?: string | null;
  completedAt?: string | null;
  overdueNoticedAt?: string | null;
  unfinishedRequests?: { requestId: string; type: string; state: string; plan: { id: string; name: string } | null }[];
}

export interface ReviewItemWire {
  assignmentId: string;
  position: number;
  application: { id: string; name: string };
  plan: { id: string; name: string };
  provisioningType: string;
  grantReason: string | null;
  decision: 'PENDING' | 'STILL_NEEDED' | 'NOT_NEEDED' | 'NEEDS_NEW_TOOL';
  decidedBy: { id: string } | null;
  decidedAt: string | null;
  newToolNote: string | null;
  reason: string | null;
  revocationTaskId: string | null;
  needsNewRequest: boolean;
}

export interface ReviewRow {
  id: string;
  employee_id: string;
  transfer_id: string | null;
  placement_id: string;
  department_id: string;
  effective_on: string;
  due_on: string;
  status: string;
  completed_at: Date | null;
  overdue_noticed_at: Date | null;
}

export interface ReviewItemRow {
  review_id: string;
  assignment_id: string;
  plan_id: string;
  position: number;
  grant_reason: string | null;
  decision: string;
  decided_by_employee_id: string | null;
  decided_at: Date | null;
  reason?: string | null;
  new_tool_note: string | null;
  revocation_task_id: string | null;
}

/**
 * The seat and revocation harness with what the tests of the review after a transfer need: the people and the toolset, the calls of its four
 * routes and what the reviews look like in the database. No assertion lives here.
 */
export class TransferReviewHarness extends SeatRevocationHarness {
  reviews = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/transfer-reviews${query}`).set(this.as(account));
  review = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/transfer-reviews/${id}`).set(this.as(account));
  reviewItems = (id: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/transfer-reviews/${id}/items${query}`).set(this.as(account));
  /** The head always says why (F17); a test that wants it missing passes `reason: undefined`. */
  decide = (id: string, body: object, account: ApiAccount) =>
    request(this.server())
      .post(`/api/v1/transfer-reviews/${id}/decisions`)
      .set(this.as(account))
      .send({ reason: 'Cần để tiếp tục công việc', ...body });

  /**
   * A line decided "a new tool is needed", as the lines written before that decision was retired are: it can only be read now, so it is
   * written straight to the table, the way the old release wrote it.
   */
  async legacyNewTool(reviewId: string, assignmentId: string, deciderEmployeeId: string, note: string): Promise<void> {
    await this.ctx.sql.query(
      `UPDATE transfer_review_items SET decision = 'NEEDS_NEW_TOOL', decided_by_employee_id = $3, decided_at = now(), new_tool_note = $4
        WHERE review_id = $1 AND assignment_id = $2`,
      [reviewId, assignmentId, deciderEmployeeId, note],
    );
  }

  /** The reminder of the hour for the reviews past their deadline, run by hand. */
  noticeLateReviews = (now: Date = new Date()) => this.ctx.app.get(TransferReviewOverdueService).noticeOverdue(now);

  /** The transfer of the person to the department from today, recorded as the Super Admin does; the review opens in the same step. */
  async moveToday(person: Person, to: Department, extra: object = {}) {
    return this.recorded({
      employeeId: person.employeeId,
      toDepartmentId: to.id,
      effectiveOn: this.today(),
      groundsNote: this.groundsNote,
      ...extra,
    });
  }

  private sequence = 0;

  /**
   * A person of `from` who holds the tools (a subscription or an internal plan each) and is moved to `to` from today: the seats in
   * the order of the tools, and the review the move opened, if it opened one.
   */
  async movedWith(
    from: Department,
    to: Department,
    tools: { subscriptionId?: string; planId?: string }[],
  ): Promise<{ person: Person; seats: string[]; review: ReviewRow | null }> {
    const code = `E-TR-${(this.sequence += 1)}`;
    const person = await this.veteran(from, code);
    const seats: string[] = [];
    for (const tool of tools) seats.push(await this.seatOf(person, tool, code));
    await this.moveToday(person, to);

    return { person, seats, review: (await this.reviewRows(person.employeeId))[0] ?? null };
  }

  async reviewRows(employeeId?: string): Promise<ReviewRow[]> {
    const { rows } = await this.ctx.sql.query<ReviewRow>(
      `SELECT id, employee_id, transfer_id, placement_id, department_id, to_char(effective_on, 'YYYY-MM-DD') AS effective_on,
              to_char(due_on, 'YYYY-MM-DD') AS due_on, status::text AS status, completed_at, overdue_noticed_at
         FROM transfer_reviews WHERE ($1::uuid IS NULL OR employee_id = $1) ORDER BY opened_at, id`,
      [employeeId ?? null],
    );

    return rows;
  }

  async itemRows(reviewId: string): Promise<ReviewItemRow[]> {
    const { rows } = await this.ctx.sql.query<ReviewItemRow>(
      `SELECT review_id, assignment_id, plan_id, position, grant_reason, decision::text AS decision, decided_by_employee_id,
              decided_at, new_tool_note, reason, revocation_task_id
         FROM transfer_review_items WHERE review_id = $1 ORDER BY position`,
      [reviewId],
    );

    return rows;
  }

  /** Moves the deadline of a review into the past, the one thing a test cannot wait for; the trigger that fixes it is off for the update. */
  async backdate(reviewId: string, dueOn: string): Promise<void> {
    await this.ctx.sql.query(`ALTER TABLE transfer_reviews DISABLE TRIGGER transfer_reviews_guard`);
    try {
      await this.ctx.sql.query(
        `UPDATE transfer_reviews SET due_on = $2, effective_on = LEAST(effective_on, $2) WHERE id = $1`,
        [reviewId, dueOn],
      );
    } finally {
      await this.ctx.sql.query(`ALTER TABLE transfer_reviews ENABLE TRIGGER transfer_reviews_guard`);
    }
  }

  /** What the database keeps of a task: how it is worked and where it stands. */
  async taskRow(id: string) {
    return (
      await this.ctx.sql.query<{ kind: string; channel: string; status: string; revocation_source: string | null }>(
        `SELECT kind::text AS kind, channel::text AS channel, status::text AS status, revocation_source::text AS revocation_source
           FROM provisioning_tasks WHERE id = $1`,
        [id],
      )
    ).rows[0];
  }

  /** The reasons that asked for the revocation of the seat, with who decided and on what, oldest first. */
  async reasonRows(assignmentId: string) {
    const { rows } = await this.ctx.sql.query<{
      source: string;
      decided_by_employee_id: string | null;
      decided_role: string;
      reference_kind: string | null;
      reference_id: string | null;
    }>(
      `SELECT r.source::text AS source, r.decided_by_employee_id, r.decided_role, r.reference_kind, r.reference_id
         FROM provisioning_task_reasons r JOIN provisioning_tasks t ON t.id = r.task_id
        WHERE t.assignment_id = $1 ORDER BY r.created_at, r.id`,
      [assignmentId],
    );

    return rows;
  }

  /** Revocation tasks the seat has, by the source that opened them. */
  async revocationSourcesOf(assignmentId: string): Promise<string[]> {
    const { rows } = await this.ctx.sql.query<{ source: string }>(
      `SELECT r.source::text AS source FROM provisioning_task_reasons r JOIN provisioning_tasks t ON t.id = r.task_id
        WHERE t.assignment_id = $1 ORDER BY r.created_at, r.id`,
      [assignmentId],
    );

    return rows.map((row) => row.source);
  }
}
