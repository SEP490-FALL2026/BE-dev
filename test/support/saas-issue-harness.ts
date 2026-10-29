import request from 'supertest';
import { SaasIssueSweepService } from '../../src/modules/licensing/saas-issue/saas-issue-sweep.service';
import { OrganizationApi } from '../../src/modules/organization/public/organization.api';
import type { ApiAccount } from './api-accounts';
import { ExpiryHarness } from './expiry-harness';
import type { Department, Person } from './request-harness';

export interface IssueWire {
  id: string;
  code: string;
  state: string;
  category: string;
  impact: string;
  assignmentId: string;
  plan: { planId: string; planName: string; applicationName: string };
  reporter: { employeeId: string; employeeCode: string };
  assignedItAdmin: { employeeId: string; employeeCode: string };
  responseDueOn: string;
  overdue: boolean;
  createdAt: string;
  occurredAt?: string;
  description?: string;
  grantTaskId?: string | null;
  assignedByFallback?: boolean;
  resolution?: string | null;
  vendorTicketRef?: string | null;
  linkedWork?: Record<string, string | null>;
  duplicateOf?: { id: string; code: string } | null;
  duplicateReason?: string | null;
  resolvedAt?: string | null;
  reopenUntil?: string | null;
  closedAt?: string | null;
  reopenCount?: number;
}

export interface EntryWire {
  id: string;
  kind: 'MESSAGE' | 'TRANSITION';
  authorRole: string;
  author: { employeeId: string } | null;
  body: string | null;
  fromState: string | null;
  toState: string | null;
  onBehalfOf: { employeeId: string } | null;
}

export interface OptionsWire {
  secretWarning: { code: string; message: string };
  descriptionMaxLength: number;
  categories: Record<string, string>;
  impacts: Record<string, string>;
  items: Array<{ assignmentId: string; plan: { planName: string }; grantTaskId: string | null }>;
  pagination: { totalItems: number };
}

export interface IssueRow {
  id: string;
  state: string;
  assigned_it_admin_employee_id: string;
  assigned_by_fallback: boolean;
  response_due_on: string;
  response_overdue_noticed_at: Date | null;
  resolution: string | null;
  vendor_ticket_ref: string | null;
  reopen_until: string | null;
  reopen_count: number;
  grant_task_id: string | null;
  linked_work: Record<string, string> | null;
  duplicate_of_id: string | null;
}

/** A Monday far enough ahead that the seats and the people the data was written for already exist, and no holiday falls near it. */
export const MONDAY = '2026-12-07';

/**
 * The expiry harness with what the tests of the reports of errors in SaaS rights need: the calls of the nine routes, the reports as
 * the database keeps them, the hourly pass run by hand, a grant task that is not finished, and a way to say what day it is. No
 * assertion lives here.
 */
export class SaasIssueHarness extends ExpiryHarness {
  issueOptions = (account: ApiAccount, query = '') =>
    request(this.server()).get(`/api/v1/saas-issues/options${query}`).set(this.as(account));
  submitIssue = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/saas-issues').set(this.as(account)).send(body);
  listIssues = (account: ApiAccount, query = '') =>
    request(this.server()).get(`/api/v1/saas-issues${query}`).set(this.as(account));
  readIssue = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/saas-issues/${id}`).set(this.as(account));
  issueEntries = (id: string, account: ApiAccount, query = '') =>
    request(this.server()).get(`/api/v1/saas-issues/${id}/entries${query}`).set(this.as(account));
  addIssueMessage = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/saas-issues/${id}/messages`).set(this.as(account)).send(body);
  reopenIssue = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/saas-issues/${id}/reopening`).set(this.as(account)).send(body);
  moveIssue = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/saas-issues/${id}/transitions`).set(this.as(account)).send(body);
  duplicateIssue = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/saas-issues/${id}/duplicate`).set(this.as(account)).send(body);

  /** The body of a report with the usual values; `extra` overrides. */
  issueBody = (assignmentId: string, extra: Record<string, unknown> = {}) => ({
    assignmentId,
    category: 'NO_ACCESS',
    impact: 'UNUSABLE',
    description: 'I cannot open the workspace: it says the account is not allowed.',
    occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
    ...extra,
  });

  /** A report sent and expected to succeed (201). */
  async reported(account: ApiAccount, assignmentId: string, extra: Record<string, unknown> = {}): Promise<IssueWire> {
    const response = await this.submitIssue(this.issueBody(assignmentId, extra), account);
    if (response.status !== 201) throw new Error(`report: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<IssueWire>(response);
  }

  /** A department with an IT Admin in charge, and a member of it holding a personal right on the target. */
  async reporterIn(
    code: string,
    inCharge: Person | null,
    target: { subscriptionId?: string; planId?: string },
  ): Promise<{ department: Department; member: Person; assignmentId: string }> {
    const department = await this.departmentWithUnit(code);
    const member = await this.staff(department, `${code}-E`);
    if (inCharge) await this.setItAdminInCharge(department, inCharge);
    const assignmentId = await this.seatOf(member, target);

    return { department, member, assignmentId };
  }

  /** The grant of the assignment is not finished: a task waits in the queue for it, as a request that was approved leaves it. */
  async openGrantTask(assignmentId: string, status = 'QUEUED'): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id, max_attempts,
                                       created_by_app_user_id, updated_at)
       SELECT gen_random_uuid(), a.organization_id, a.id, 'GRANT', 'MANUAL', $2::"ProvisioningTaskStatus", gen_random_uuid(), 4,
              a.created_by_app_user_id, now()
         FROM license_assignments a WHERE a.id = $1
       RETURNING id`,
      [assignmentId, status],
    );

    return rows[0].id;
  }

  async issueRow(id: string): Promise<IssueRow> {
    const { rows } = await this.ctx.sql.query<IssueRow>(
      `SELECT id, state::text AS state, assigned_it_admin_employee_id, assigned_by_fallback,
              to_char(response_due_on, 'YYYY-MM-DD') AS response_due_on, response_overdue_noticed_at, resolution,
              vendor_ticket_ref, to_char(reopen_until, 'YYYY-MM-DD') AS reopen_until, reopen_count, grant_task_id,
              linked_work, duplicate_of_id
         FROM saas_issues WHERE id = $1`,
      [id],
    );

    return rows[0];
  }

  async issueCount(): Promise<number> {
    return this.count('saas_issues');
  }

  /** The audit events of an action on a report, oldest first. */
  async issueEvents(action: string, id: string) {
    return (
      await this.ctx.sql.query<{
        actor_kind: string;
        actor_app_user_id: string | null;
        before: Record<string, unknown> | null;
        after: Record<string, unknown>;
      }>(
        `SELECT actor_kind::text, actor_app_user_id, before, after FROM audit_events
          WHERE action = $1 AND resource_id = $2 ORDER BY occurred_at, id`,
        [action, id],
      )
    ).rows;
  }

  /** The hourly pass, run by hand as if it were `now`. */
  sweepIssues = (now?: Date): Promise<{ closed: number; told: number }> =>
    this.ctx.app.get(SaasIssueSweepService, { strict: false }).run(now);

  /** The organization says today is `day` until the returned function is called. */
  pretendToday(day: string): () => void {
    const spy = jest.spyOn(this.ctx.app.get(OrganizationApi, { strict: false }), 'businessToday');
    spy.mockResolvedValue(day);

    return () => spy.mockRestore();
  }

  async entriesOf(id: string, account: ApiAccount): Promise<EntryWire[]> {
    return this.dataOf<{ items: EntryWire[] }>(await this.issueEntries(id, account, '?pageSize=100').expect(200)).items;
  }
}
