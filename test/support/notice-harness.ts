import request from 'supertest';
import { pretendBusinessToday } from './pretend-today';
import { NoticeOverdueService } from '../../src/modules/personnel/notice/notice-overdue.service';
import type { ApiAccount } from './api-accounts';
import { OffboardingHarness } from './offboarding-harness';
import type { Department, Person } from './request-harness';

export interface NoticeWire {
  id: string;
  code: string;
  employee: { id: string; employeeCode: string; fullName: string };
  kind: string;
  proposedOn: string;
  status: 'PENDING_VERIFICATION' | 'RECORDED' | 'REJECTED' | 'WITHDRAWN';
  dueOn: string;
  overdue: boolean;
  priority: boolean;
  note?: string | null;
  sender?: { id: string };
  targetDepartment?: { id: string; code: string } | null;
  defaultItAdminEmployeeId?: string | null;
  rejectReason?: string | null;
  recordedEvent?: { kind: string; id: string } | null;
  handledAt?: string | null;
  overdueNoticedAt?: string | null;
  verification?: { method: string; reference: string; verifiedByAppUserId: string } | null;
}

export interface NoticeRow {
  id: string;
  code: string;
  employee_id: string;
  kind: string;
  proposed_on: string;
  status: string;
  due_on: string;
  reject_reason: string | null;
  recorded_event_kind: string | null;
  recorded_event_id: string | null;
  default_it_admin_employee_id: string | null;
  handled_by_app_user_id: string | null;
  overdue_noticed_at: Date | null;
}

/**
 * The offboarding harness with what the tests of the notices of the heads need: the calls of the seven routes, the notices as the
 * database keeps them, and the hourly telling run by hand. No assertion lives here.
 */
export class NoticeHarness extends OffboardingHarness {
  readonly verification = { method: 'ATTACHED_DOCUMENT', reference: 'Resignation letter DN-31/2026' };
  readonly resignation = { type: 'RESIGNATION_LETTER', reference: 'DN-31/2026', issuer: 'E1', issuedOn: '2026-10-20' };

  sendNotice = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/personnel-notices').set(this.as(account)).send(body);
  listNotices = (query: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/personnel-notices${query}`).set(this.as(account));
  readNotice = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/personnel-notices/${id}`).set(this.as(account));
  withdrawNotice = (id: string, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/personnel-notices/${id}/withdrawal`).set(this.as(account));
  rejectNotice = (id: string, body: object, account: ApiAccount = this.sa) =>
    request(this.server()).post(`/api/v1/personnel-notices/${id}/rejection`).set(this.as(account)).send(body);
  recordNotice = (id: string, body: object, account: ApiAccount = this.sa) =>
    request(this.server()).post(`/api/v1/personnel-notices/${id}/recording`).set(this.as(account)).send(body);
  linkNotice = (id: string, body: object, account: ApiAccount = this.sa) =>
    request(this.server()).post(`/api/v1/personnel-notices/${id}/linking`).set(this.as(account)).send(body);

  /** A notice sent and expected to succeed (201). */
  async sentNotice(body: object, account: ApiAccount): Promise<NoticeWire> {
    const response = await this.sendNotice(body, account);
    if (response.status !== 201) throw new Error(`send: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<NoticeWire>(response);
  }

  /** The body of a recording of a departure notice: the check, the basis and the last working day. */
  recording = (event: object, extra: object = {}) => ({
    verification: this.verification,
    grounds: this.resignation,
    event,
    ...extra,
  });

  /** The head of a new department with an account, ready to send. */
  async head(department: Department, code: string): Promise<Person> {
    const person = await this.worker(department, code);
    await this.makeHead(department, person);

    return person;
  }

  /** The notices about the person as the database keeps them, oldest first. */
  async noticeRows(employeeId: string): Promise<NoticeRow[]> {
    const { rows } = await this.ctx.sql.query<NoticeRow>(
      `SELECT id, code, employee_id, kind::text AS kind, to_char(proposed_on, 'YYYY-MM-DD') AS proposed_on,
              status::text AS status, to_char(due_on, 'YYYY-MM-DD') AS due_on, reject_reason,
              recorded_event_kind::text AS recorded_event_kind, recorded_event_id, default_it_admin_employee_id,
              handled_by_app_user_id, overdue_noticed_at
         FROM personnel_notices WHERE employee_id = $1 ORDER BY created_at, id`,
      [employeeId],
    );

    return rows;
  }

  /** The organization says today is `day` until the returned function is called; the data written meanwhile is dated from it. */
  pretendToday(day: string): () => void {
    const spy = pretendBusinessToday(this.ctx.app, day);

    return () => spy.mockRestore();
  }

  async noticeCount(): Promise<number> {
    return this.count('personnel_notices');
  }

  async verificationRows(noticeId: string) {
    const { rows } = await this.ctx.sql.query<{ method: string; reference: string; verified_by_app_user_id: string }>(
      `SELECT method::text AS method, reference, verified_by_app_user_id FROM personnel_notice_verifications WHERE notice_id = $1`,
      [noticeId],
    );

    return rows;
  }

  /** The events that carry the notice as their origin, in the three tables, as `table:id`. */
  async eventsOfNotice(noticeId: string): Promise<string[]> {
    const { rows } = await this.ctx.sql.query<{ origin: string }>(
      `SELECT 'transfer:' || id AS origin FROM department_transfers WHERE notice_id = $1
       UNION ALL SELECT 'leave:' || id FROM employee_leaves WHERE notice_id = $1
       UNION ALL SELECT 'case:' || id FROM offboarding_cases WHERE notice_id = $1`,
      [noticeId],
    );

    return rows.map((row) => row.origin);
  }

  /** The hourly telling of the late notices, run by hand at noon of `day` (default today) in the calendar of the organization. */
  noticeOverdueAt = (day: string = this.today()): Promise<number> =>
    this.ctx.app.get(NoticeOverdueService, { strict: false }).noticeOverdue(new Date(`${day}T12:00:00Z`));

  /** The long leave of the person that runs, as the database keeps it. */
  async runningLeaveOf(employeeId: string) {
    const { rows } = await this.ctx.sql.query<{ id: string; status: string; approved_return_on: string }>(
      `SELECT id, status::text AS status, to_char(approved_return_on, 'YYYY-MM-DD') AS approved_return_on
         FROM employee_leaves WHERE employee_id = $1 AND status = 'ACTIVE'`,
      [employeeId],
    );

    return rows[0];
  }

  /** How many events of each kind the person has, for "nothing else was made". */
  async eventCounts(employeeId: string): Promise<{ transfers: number; leaves: number; cases: number }> {
    const { rows } = await this.ctx.sql.query<{ transfers: string; leaves: string; cases: string }>(
      `SELECT (SELECT count(*) FROM department_transfers WHERE employee_id = $1)::text AS transfers,
              (SELECT count(*) FROM employee_leaves WHERE employee_id = $1)::text AS leaves,
              (SELECT count(*) FROM offboarding_cases WHERE employee_id = $1)::text AS cases`,
      [employeeId],
    );

    return { transfers: Number(rows[0].transfers), leaves: Number(rows[0].leaves), cases: Number(rows[0].cases) };
  }
}
