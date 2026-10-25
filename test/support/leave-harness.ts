import request from 'supertest';
import { LeaveOverdueService } from '../../src/modules/personnel/leave/leave-overdue.service';
import { LeaveDepartureService } from '../../src/modules/personnel/leave/leave-departure.service';
import { PersonnelService } from '../../src/modules/personnel/personnel.service';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import type { ApiAccount } from './api-accounts';
import type { Department, Person } from './request-harness';
import { TransferHarness } from './transfer-harness';

export interface LeaveWire {
  id: string;
  employee: { id: string; employeeCode: string; fullName: string };
  status: 'ACTIVE' | 'ENDED';
  startedOn: string;
  approvedReturnOn: string;
  endedOn: string | null;
  overdueReturn: boolean;
  grounds: { type: string; reference: string; issuer: string; issuedOn: string };
  endKind: 'RETURNED' | 'DEPARTURE_STARTED' | null;
  resumesLeaveId: string | null;
  startedByAppUserId: string;
  selfExecuted: boolean;
}

export interface LeaveChangeWire {
  id: string;
  kind: 'STARTED' | 'RETURN_DATE_CHANGED' | 'RETURNED' | 'ENDED_FOR_DEPARTURE' | 'RESUMED';
  oldReturnOn: string | null;
  newReturnOn: string | null;
  returnedOn: string | null;
  onSchedule: boolean | null;
  grounds: { type: string; reference: string; issuer: string; issuedOn: string } | null;
  selfExecuted: boolean;
}

/** The people, the calls of the routes of the long leaves and what a leave leaves in the database. No assertion lives here. */
export class LeaveHarness extends TransferHarness {
  readonly approval = {
    type: 'LEAVE_APPROVAL',
    reference: 'DN-05/2026',
    issuer: 'HR Department',
    issuedOn: '2026-05-25',
  };
  readonly extension = {
    type: 'LEAVE_EXTENSION',
    reference: 'GH-09/2026',
    issuer: 'HR Department',
    issuedOn: '2026-08-20',
  };

  /** A person of the department who joined long ago, so a leave may begin on any recent day. */
  async worker(department: Department, code: string, roles: string[] = []): Promise<Person> {
    const person = await this.veteran(department, code, roles);
    await this.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [person.employeeId]);

    return person;
  }

  startLeave = (body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post('/api/v1/long-leaves').set(this.as(account)).send(body);
  changeReturnDate = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/long-leaves/${id}/return-date-changes`).set(this.as(account)).send(body);
  confirmReturn = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/long-leaves/${id}/returns`).set(this.as(account)).send(body);
  readLeave = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/long-leaves/${id}`).set(this.as(account));
  listLeaves = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/long-leaves${query}`).set(this.as(account));
  leaveChanges = (id: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/long-leaves/${id}/changes${query}`).set(this.as(account));

  /** A leave started and expected to succeed (201). */
  async started(body: object, account: ApiAccount = this.it1): Promise<LeaveWire> {
    const response = await this.startLeave(body, account);
    if (response.status !== 201) throw new Error(`start: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<LeaveWire>(response);
  }

  async workState(employeeId: string): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ work_state: string }>(
      `SELECT work_state::text FROM employees WHERE id = $1`,
      [employeeId],
    );

    return rows[0].work_state;
  }

  /** The leaves of the person, oldest first, as the database keeps them (dates as `YYYY-MM-DD`). */
  async leavesOf(employeeId: string) {
    const { rows } = await this.ctx.sql.query<{
      id: string;
      status: string;
      started_on: string;
      approved_return_on: string;
      ended_on: string | null;
      end_kind: string | null;
      resumes_leave_id: string | null;
      return_overdue_noticed_for: string | null;
    }>(
      `SELECT id, status::text AS status, to_char(started_on, 'YYYY-MM-DD') AS started_on,
              to_char(approved_return_on, 'YYYY-MM-DD') AS approved_return_on,
              to_char(ended_on, 'YYYY-MM-DD') AS ended_on, end_kind::text AS end_kind, resumes_leave_id,
              to_char(return_overdue_noticed_for, 'YYYY-MM-DD') AS return_overdue_noticed_for
         FROM employee_leaves WHERE employee_id = $1 ORDER BY started_at, id`,
      [employeeId],
    );

    return rows;
  }

  async changeRows(leaveId: string): Promise<{ kind: string }[]> {
    const { rows } = await this.ctx.sql.query<{ kind: string }>(
      `SELECT kind::text AS kind FROM employee_leave_changes WHERE leave_id = $1 ORDER BY recorded_at, id`,
      [leaveId],
    );

    return rows;
  }

  /** The hourly telling of the late returns, run by hand at noon of `day` (default today) in the calendar of the organization. */
  noticeOverdueAt = (day: string = this.today()): Promise<number> =>
    this.ctx.app.get(LeaveOverdueService, { strict: false }).noticeOverdue(new Date(`${day}T12:00:00Z`));

  departure = () => this.ctx.app.get(LeaveDepartureService, { strict: false });
  personnel = () => this.ctx.app.get(PersonnelService, { strict: false });
  inTransaction = <T>(work: Parameters<TransactionRunner['run']>[0]): Promise<T> =>
    this.ctx.app.get(TransactionRunner, { strict: false }).run(work) as Promise<T>;
}
