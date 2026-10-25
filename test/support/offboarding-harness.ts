import request from 'supertest';
import { subtractWorkingDays } from '../../src/core/working-days';
import type { ApiAccount } from './api-accounts';
import { HandoverHarness } from './handover-harness';
import type { Department, Person } from './request-harness';

export interface CaseWire {
  id: string;
  employee: { id: string; employeeCode: string; fullName: string };
  state: 'HANDING_OVER' | 'LEFT' | 'CANCELLED';
  abrupt: boolean;
  lastWorkingDay: string;
  handoverDueOn: string | null;
  pastLastDay: boolean;
  heldRights: number;
  accountLockMissing: boolean;
  closed: boolean;
  department?: { id: string; code: string; name: string };
  priorWorkState?: 'WORKING' | 'ON_LONG_LEAVE';
  departureEffectiveOn?: string;
  grounds?: { type: string; reference: string; issuer: string; issuedOn: string };
  headSuccessor?: { kind: 'EMPLOYEE' | 'NONE'; employee: { id: string } | null } | null;
  selfExecuted?: boolean;
  left?: { leftOn: string; leftAt: string; leftByAppUserId: string } | null;
  cancellation?: { cancelledAt: string; reason: string } | null;
  accountLock?: { recordedAt: string; recordedByAppUserId: string; note: string } | null;
  closure?: { closedAt: string } | null;
  checklist?: {
    dataHandover: { state: string; pendingDuties: number };
    accountLock: { state: string; urgent: boolean };
    revokeAccess: { state: string; heldRights: number; withoutTask: number; accessRunsOn: number };
    seatsReleased: { state: string; opened: number; released: number };
  } | null;
  blockers?: Record<string, number>;
  warnings?: {
    departmentWithoutHeadFrom: string | null;
    businessOwnerApplications: number;
    accountLockNotRecorded: boolean;
    registered: Record<string, number>;
  };
  revocations?: { created: number; reasonAdded: number };
}

export interface RightWire {
  assignmentId: string;
  application: { id: string; name: string };
  plan: { id: string; name: string };
  provisioningType: string;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  revocable: boolean;
  revocation: { taskId: string; status: string; source: string } | null;
  accessRunsOnUntil: string | null;
  handover: {
    dutyId: string;
    status: string;
    role: string;
    confirmer: { id: string } | null;
    waitingReason: string | null;
    dueOn: string;
    overdue: boolean;
    flaggedUnconfirmed: boolean;
  } | null;
}

export interface CaseRow {
  id: string;
  state: string;
  abrupt: boolean;
  prior_work_state: string;
  last_working_day: string;
  departure_effective_on: string;
  handover_due_on: string | null;
  placement_closed_id: string | null;
  left_on: string | null;
  account_lock_at: Date | null;
  closed_at: Date | null;
  self_executed: boolean;
}

/**
 * The handover harness with what the tests of the record of a departure need: the calls of its eleven routes, the people it leaves
 * and what it writes in the database. No assertion lives here.
 */
export class OffboardingHarness extends HandoverHarness {
  /** The working day before `day`, with no day off in the calendar of a test installation. */
  dueBefore = (day: string): string => subtractWorkingDays(day, 1, new Set());

  recordCase = (body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post('/api/v1/offboarding-cases').set(this.as(account)).send(body);
  readCase = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/offboarding-cases/${id}`).set(this.as(account));
  listCases = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/offboarding-cases${query}`).set(this.as(account));
  rightsOf = (id: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/offboarding-cases/${id}/rights${query}`).set(this.as(account));
  caseChanges = (id: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/offboarding-cases/${id}/changes${query}`).set(this.as(account));
  changeLastDay = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/offboarding-cases/${id}/last-day-changes`).set(this.as(account)).send(body);
  cancelCase = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/offboarding-cases/${id}/cancellation`).set(this.as(account)).send(body);
  markLeft = (id: string, body: object = {}, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/offboarding-cases/${id}/departure`).set(this.as(account)).send(body);
  lockAccount = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/offboarding-cases/${id}/account-lock`).set(this.as(account)).send(body);
  revokeRights = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/offboarding-cases/${id}/revocations`).set(this.as(account)).send(body);
  closeCase = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/offboarding-cases/${id}/closure`).set(this.as(account));
  openRequestsOf = (id: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/offboarding-cases/${id}/open-requests${query}`).set(this.as(account));
  openGrantTasksOf = (id: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/offboarding-cases/${id}/open-grant-tasks${query}`).set(this.as(account));
  /** The IT Admin closes a request because the person it was for left (`US-03-04` AC-25). */
  cancelForDeparture = (
    requestId: string,
    body: object = { cause: 'BENEFICIARY_LEFT' },
    account: ApiAccount = this.it1,
  ) =>
    request(this.server()).post(`/api/v1/access-requests/${requestId}/cancellation`).set(this.as(account)).send(body);
  startLongLeave = (body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post('/api/v1/long-leaves').set(this.as(account)).send(body);

  /** The body of a record for `person`: a planned handover ending on `day(10)` on the basis of a decision. */
  body = (person: Person, extra: object = {}) => ({
    employeeId: person.employeeId,
    lastWorkingDay: this.day(10),
    grounds: this.grounds,
    ...extra,
  });

  /** A departure recorded and expected to succeed (201). */
  async recordedCase(person: Person, extra: object = {}, account: ApiAccount = this.it1): Promise<CaseWire> {
    const response = await this.recordCase(this.body(person, extra), account);
    if (response.status !== 201) throw new Error(`record: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<CaseWire>(response);
  }

  async worker(department: Department, code: string, roles: string[] = []): Promise<Person> {
    const person = await this.veteran(department, code, roles);
    await this.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [person.employeeId]);

    return person;
  }

  async caseRow(id: string): Promise<CaseRow> {
    const { rows } = await this.ctx.sql.query<CaseRow>(
      `SELECT id, state::text AS state, abrupt, prior_work_state::text AS prior_work_state,
              to_char(last_working_day, 'YYYY-MM-DD') AS last_working_day,
              to_char(departure_effective_on, 'YYYY-MM-DD') AS departure_effective_on,
              to_char(handover_due_on, 'YYYY-MM-DD') AS handover_due_on, placement_closed_id,
              to_char(left_on, 'YYYY-MM-DD') AS left_on, account_lock_at, closed_at, self_executed
         FROM offboarding_cases WHERE id = $1`,
      [id],
    );

    return rows[0];
  }

  async caseCount(employeeId: string): Promise<number> {
    const { rows } = await this.ctx.sql.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM offboarding_cases WHERE employee_id = $1`,
      [employeeId],
    );

    return Number(rows[0].n);
  }

  async changeKinds(caseId: string): Promise<string[]> {
    const { rows } = await this.ctx.sql.query<{ kind: string }>(
      `SELECT kind::text AS kind FROM offboarding_case_changes WHERE case_id = $1 ORDER BY changed_at, id`,
      [caseId],
    );

    return rows.map((row) => row.kind);
  }

  async workState(employeeId: string): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ work_state: string; status: string }>(
      `SELECT work_state::text, status::text FROM employees WHERE id = $1`,
      [employeeId],
    );

    return `${rows[0].status}/${rows[0].work_state}`;
  }

  async employeeLeftOn(employeeId: string): Promise<string | null> {
    const { rows } = await this.ctx.sql.query<{ day: string | null }>(
      `SELECT to_char(employee_left_on, 'YYYY-MM-DD') AS day FROM app_users WHERE employee_id = $1`,
      [employeeId],
    );

    return rows[0]?.day ?? null;
  }

  async taskCount(): Promise<number> {
    return this.count('provisioning_tasks');
  }
}
