import request from 'supertest';
import type { ApiAccount } from './api-accounts';
import { assignmentIdOf, importSeats } from './builders/seat.builder';
import type { AccessRequestWire, Person } from './request-harness';
import { ServiceAccountHarness } from './service-account-harness';

/** A return as the wire carries it, in a list and in its detail. */
export interface ReturnWire {
  id: string;
  state: 'AWAITING_REVOCATION' | 'COMPLETED' | 'FAILED';
  source: 'EMPLOYEE_RETURN' | 'HEAD_CONFIRMATION';
  assignmentId: string;
  plan: { planId: string; planName: string; applicationId: string; applicationName: string };
  holder: { employeeId: string };
  requestedBy: { employeeId: string };
  department: { id: string; code: string; name: string };
  requestedOn: string;
  handover: { required: boolean; dueOn: string | null; confirmed: boolean; flagged: boolean };
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
  reason?: string;
  revocationNote?: string | null;
  originRequestId?: string | null;
  handoverConfirmedBy?: { employeeId: string } | null;
  handoverConfirmedAt?: string | null;
  failureReason?: string | null;
}

/** A request for a renewal as the wire carries it: the request, with what is particular to the renewal. */
export interface RenewalWire extends AccessRequestWire {
  expectedEndDate: string | null;
  renewal: {
    assignmentId: string;
    previousExpectedEndDate: string;
    newExpectedEndDate: string;
    consecutiveMonths: number;
    applied: { successorAssignmentId: string; appliedAt: string } | null;
  } | null;
}

export interface SeatRow {
  id: string;
  employee_id: string;
  source: string;
  predecessor_id: string | null;
  valid_from: string;
  valid_until: string | null;
  expected_end_date: string | null;
}

/**
 * The service-account harness with what the tests of the return and the renewal of a seat need: seats that began before today
 * (so that giving one back is seen on the seats free today), the calls of the routes of returns and renewals and of the queue
 * that takes a seat away. No assertion lives here.
 */
export class ReturnHarness extends ServiceAccountHarness {
  returnSeat = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/return-requests').set(this.as(account)).send(body);
  returnList = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/return-requests').query(query).set(this.as(account));
  returnGet = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/return-requests/${id}`).set(this.as(account));
  renew = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/access-requests/renewals').set(this.as(account)).send(body);
  revoked = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server())
      .post(`/api/v1/provisioning-tasks/${id}/revocation-completion`)
      .set(this.as(account))
      .send(body);

  /** The day `days` from today in the calendar of the organization. */
  inDays = (days: number): string => {
    const date = new Date(`${this.today()}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  };

  /** Sends the return and returns it, failing on anything but 201. */
  async returned(account: ApiAccount, body: object): Promise<ReturnWire> {
    const response = await this.returnSeat(body, account);
    if (response.status !== 201) throw new Error(`return: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ returnRequest: ReturnWire }>(response).returnRequest;
  }

  /** A seat of the person on the target as a baseline records it; `expectedEndDate` makes it a right that ends on a day. */
  async seatOf(
    person: Person,
    target: { subscriptionId?: string; planId?: string },
    options: { grantedOn?: string; expectedEndDate?: string } = {},
  ): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ employee_code: string }>(
      `SELECT employee_code FROM employees WHERE id = $1`,
      [person.employeeId],
    );
    const code = rows[0].employee_code;
    // A target names one subscription or one internal plan, never both. Uploaded, confirmed and found through the services
    // (T2.2): the suites standing on this seat do not prove the import.
    const one = target.subscriptionId ? { subscriptionId: target.subscriptionId } : { planId: target.planId };
    await importSeats(
      this.ctx,
      this.it1.accessToken,
      one,
      this.file([
        {
          employee_code: code,
          account_identifier: `${code.toLowerCase()}@acme.vn`,
          granted_on: options.grantedOn ?? '2026-10-05',
          ...(options.expectedEndDate ? { expected_end_date: options.expectedEndDate } : {}),
        },
      ]),
    );
    const found = await assignmentIdOf(
      this.ctx,
      one.subscriptionId ? { subscriptionId: one.subscriptionId } : { planId: one.planId ?? '' },
      person.employeeId,
    );
    if (!found) throw new Error(`no seat of ${code}`);

    return found;
  }

  /** The plan says what to do before its right is taken away, and whether removing it loses data. */
  async describeRemoval(planId: string, note: string | null, dataLoss: boolean): Promise<void> {
    await this.ctx.sql.query(`UPDATE plans SET revocation_note = $2, data_loss_on_removal = $3 WHERE id = $1`, [
      planId,
      note,
      dataLoss,
    ]);
  }

  async seatRow(id: string): Promise<SeatRow> {
    return (
      await this.ctx.sql.query<SeatRow>(
        `SELECT id, employee_id, source::text, predecessor_id, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
                to_char(valid_until, 'YYYY-MM-DD') AS valid_until,
                to_char(expected_end_date, 'YYYY-MM-DD') AS expected_end_date
           FROM license_assignments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  }

  /** The records that follow the one given, oldest first. */
  async successorsOf(id: string): Promise<SeatRow[]> {
    return (
      await this.ctx.sql.query<SeatRow>(
        `SELECT id, employee_id, source::text, predecessor_id, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
                to_char(valid_until, 'YYYY-MM-DD') AS valid_until,
                to_char(expected_end_date, 'YYYY-MM-DD') AS expected_end_date
           FROM license_assignments WHERE predecessor_id = $1 ORDER BY valid_from, id`,
        [id],
      )
    ).rows;
  }

  /** The live revocation task of a seat (not closed as failed, not cancelled), or null. */
  async liveTaskOf(assignmentId: string): Promise<{ id: string; status: string; source: string } | null> {
    const { rows } = await this.ctx.sql.query<{ id: string; status: string; source: string }>(
      `SELECT id, status::text, revocation_source::text AS source FROM provisioning_tasks
        WHERE assignment_id = $1 AND kind = 'REVOKE' AND status NOT IN ('CLOSED_FAILED', 'CANCELLED')`,
      [assignmentId],
    );

    return rows[0] ?? null;
  }

  async reasonsOf(taskId: string) {
    return (
      await this.ctx.sql.query<{
        source: string;
        decided_role: string;
        reference_kind: string | null;
        reference_id: string | null;
      }>(
        `SELECT source::text, decided_role, reference_kind, reference_id FROM provisioning_task_reasons
          WHERE task_id = $1 ORDER BY created_at, id`,
        [taskId],
      )
    ).rows;
  }

  async returnRow(id: string) {
    return (
      await this.ctx.sql.query<{
        state: string;
        source: string;
        handover_required: boolean;
        handover_due_on: string | null;
        handover_confirmed_by_employee_id: string | null;
        handover_flagged: boolean;
        revocation_task_id: string;
        origin_request_id: string | null;
        failure_reason: string | null;
        requested_on: string;
      }>(
        `SELECT state::text, source::text, handover_required, to_char(handover_due_on, 'YYYY-MM-DD') AS handover_due_on,
                handover_confirmed_by_employee_id, handover_flagged, revocation_task_id, origin_request_id, failure_reason,
                to_char(requested_on, 'YYYY-MM-DD') AS requested_on
           FROM return_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];
  }

  async eventsOf(action: string, resourceId: string) {
    return (
      await this.ctx.sql.query<{ after: Record<string, unknown>; actor_kind: string }>(
        `SELECT after, actor_kind::text FROM audit_events WHERE action = $1 AND resource_id = $2 ORDER BY occurred_at, id`,
        [action, resourceId],
      )
    ).rows;
  }

  async renewalOf(requestId: string) {
    return (
      await this.ctx.sql.query<{
        assignment_id: string;
        previous_expected_end_date: string;
        new_expected_end_date: string;
        consecutive_months: number;
        successor_assignment_id: string | null;
      }>(
        `SELECT assignment_id, to_char(previous_expected_end_date, 'YYYY-MM-DD') AS previous_expected_end_date,
                to_char(new_expected_end_date, 'YYYY-MM-DD') AS new_expected_end_date, consecutive_months,
                successor_assignment_id
           FROM access_request_renewals WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  }

  /** A renewal of the seat, failing on anything but 201. */
  async renewed(account: ApiAccount, body: object): Promise<{ outcome: string; request: RenewalWire }> {
    const response = await this.renew(body, account);
    if (response.status !== 201) throw new Error(`renew: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ outcome: string; request: RenewalWire }>(response);
  }
}
