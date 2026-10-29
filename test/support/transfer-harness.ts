import { Client } from 'pg';
import request from 'supertest';
import { addDays } from '../../src/core/business-date';
import { OrganizationHistoryApi } from '../../src/modules/organization/public/organization-history.api';
import { OrganizationApi } from '../../src/modules/organization/public/organization.api';
import { OrganizationChangeListeners } from '../../src/modules/organization/public/organization.extension-points';
import type { OrganizationChange } from '../../src/modules/organization/public/organization.types';
import type { ApiAccount } from './api-accounts';
import { waitForLockWaiters } from './lock-wait';
import type { Person } from './request-harness';
import { ReassignmentHarness } from './reassignment-harness';
import type { Department } from './request-harness';

export interface TransferWire {
  id: string;
  employee: { id: string; employeeCode: string; fullName: string };
  from: { department: { id: string; code: string; name: string } };
  to: { department: { id: string; code: string; name: string } };
  effectiveOn: string;
  status: 'PENDING' | 'EFFECTIVE' | 'CANCELLED';
  grounds: { type: string; reference: string; issuer: string; issuedOn: string } | null;
  headSuccessor: { kind: 'EMPLOYEE' | 'NONE'; employee: { id: string } | null } | null;
  recordedByAppUserId: string | null;
  recordedByProcedure: boolean;
  effectiveAt: string | null;
  cancellation: {
    cancelledAt: string;
    cancelledByAppUserId: string | null;
    cancelledByProcedure: boolean;
    reason: string;
  } | null;
  warnings?: { code: string; applications: { id: string; name: string }[]; totalApplications: number }[];
}

export interface PlacementRow {
  id: string;
  department_id: string;
  valid_from: string;
  valid_to: string | null;
}

/** The people and departments a transfer is about, the calls of its routes and what it leaves in the database. No assertion lives here. */
export class TransferHarness extends ReassignmentHarness {
  /** The Super Admin as an account: the one who records, moves and cancels the events of the personnel context (`QĐ-87a`). */
  get sa(): ApiAccount {
    return {
      appUserId: this.seed.superAdmin.appUserId,
      employeeId: this.seed.superAdmin.employeeId,
      email: this.seed.superAdmin.email,
      accessToken: this.admin,
    };
  }

  readonly grounds = { type: 'DECISION', reference: 'QD-12/2026', issuer: 'HR Department', issuedOn: '2026-10-01' };

  /**
   * The row of the employee is held `FOR UPDATE` in a separate connection, the calls are sent one by one, each only after the one
   * before has reached a lock wait (`waitForLockWaiters`), and the row is then released: the lock goes to the calls in the order
   * they queued, so the answer of each is the answer of its place. The lock is always released and the calls always settled.
   */
  async queuedOnEmployee(
    employeeId: string,
    sends: Array<() => PromiseLike<request.Response>>,
  ): Promise<request.Response[]> {
    const holder = new Client({ connectionString: this.ctx.database.url });
    const pending: Array<Promise<request.Response>> = [];
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
      for (const send of sends) {
        pending.push(Promise.resolve(send()));
        await waitForLockWaiters(this.ctx.sql, pending.length);
      }
      await holder.query('COMMIT');
      const answers: request.Response[] = [];
      for (const answer of pending) answers.push(await answer);

      return answers;
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await Promise.allSettled(pending);
    }
  }

  /** The day `offset` days from today in the calendar of the organization. */
  day = (offset: number): string => addDays(this.today(), offset);

  /** A person of the department who has been in it since long ago, so a transfer may take effect today. */
  async veteran(department: Department, code: string, roles: string[] = []): Promise<Person> {
    const person = await this.staff(department, code, roles);
    await this.ctx.sql.query(`UPDATE employee_placements SET valid_from = '2026-01-05' WHERE employee_id = $1`, [
      person.employeeId,
    ]);

    return person;
  }

  recordTransfer = (body: object, account: ApiAccount = this.sa) =>
    request(this.server()).post('/api/v1/department-transfers').set(this.as(account)).send(body);
  rescheduleTransfer = (id: string, body: object, account: ApiAccount = this.sa) =>
    request(this.server()).post(`/api/v1/department-transfers/${id}/rescheduling`).set(this.as(account)).send(body);
  cancelTransfer = (id: string, body: object, account: ApiAccount = this.sa) =>
    request(this.server()).post(`/api/v1/department-transfers/${id}/cancellation`).set(this.as(account)).send(body);
  readTransfer = (id: string, account: ApiAccount = this.sa) =>
    request(this.server()).get(`/api/v1/department-transfers/${id}`).set(this.as(account));
  listTransfers = (query = '', account: ApiAccount = this.sa) =>
    request(this.server()).get(`/api/v1/department-transfers${query}`).set(this.as(account));
  transferChanges = (id: string, query = '', account: ApiAccount = this.sa) =>
    request(this.server()).get(`/api/v1/department-transfers/${id}/changes${query}`).set(this.as(account));

  /** A transfer recorded and expected to succeed (201). */
  async recorded(body: object, account: ApiAccount = this.sa): Promise<TransferWire> {
    const response = await this.recordTransfer(body, account);
    if (response.status !== 201) throw new Error(`record: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<TransferWire>(response);
  }

  /** The placements of the person, oldest first, as the database keeps them (dates as `YYYY-MM-DD`). */
  async placements(employeeId: string): Promise<PlacementRow[]> {
    const { rows } = await this.ctx.sql.query<PlacementRow>(
      `SELECT id, department_id, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
              to_char(valid_to, 'YYYY-MM-DD') AS valid_to
         FROM employee_placements WHERE employee_id = $1 ORDER BY valid_from`,
      [employeeId],
    );

    return rows;
  }

  /** The head periods of the department, oldest first. */
  async headPeriods(
    departmentId: string,
  ): Promise<{ employee_id: string; valid_from: string; valid_to: string | null }[]> {
    const { rows } = await this.ctx.sql.query<{ employee_id: string; valid_from: string; valid_to: string | null }>(
      `SELECT employee_id, to_char(valid_from, 'YYYY-MM-DD') AS valid_from, to_char(valid_to, 'YYYY-MM-DD') AS valid_to
         FROM department_head_periods WHERE department_id = $1 ORDER BY valid_from`,
      [departmentId],
    );

    return rows;
  }

  async auditEventsOf(action: string, resourceId: string) {
    const { rows } = await this.ctx.sql.query<{
      actor_kind: string;
      actor_app_user_id: string | null;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
    }>(
      `SELECT actor_kind, actor_app_user_id, before, after FROM audit_events
        WHERE action = $1 AND resource_id = $2 ORDER BY occurred_at, id`,
      [action, resourceId],
    );

    return rows;
  }

  async announcements(kind?: string): Promise<{ kind: string; subject_id: string; effective_on: string }[]> {
    const { rows } = await this.ctx.sql.query<{ kind: string; subject_id: string; effective_on: string }>(
      `SELECT kind::text AS kind, subject_id, to_char(effective_on, 'YYYY-MM-DD') AS effective_on
         FROM organization_change_announcements WHERE ($1::text IS NULL OR kind::text = $1) ORDER BY announced_at, id`,
      [kind ?? null],
    );

    return rows;
  }

  history = () => this.ctx.app.get(OrganizationHistoryApi, { strict: false });
  organizationService = () => this.ctx.app.get(OrganizationApi, { strict: false });

  /** The hourly telling of the organization, run by hand as of `day` (default today). */
  sweepAt = (day: string = this.today()) => this.history().announceDueChanges(day);

  private listened = 0;

  /** A listener that keeps what it is told; with `failing` it throws, so the change rolls back. Added after the listeners of the app. */
  listen(options: { failing?: () => boolean } = {}): { heard: OrganizationChange[] } {
    const heard: OrganizationChange[] = [];
    this.listened += 1;
    this.ctx.app
      .get(OrganizationChangeListeners, { strict: false })
      .add(`test.transfer-harness-${this.listened}`, (_tx, change) => {
        if (options.failing?.()) return Promise.reject(new Error('the listener failed'));
        heard.push(change);

        return Promise.resolve();
      });

    return { heard };
  }
}
