import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { addDays } from '../../src/core/business-date';
import type { ApiAccount } from './api-accounts';
import { NoticeHarness } from './notice-harness';
import type { Department, Person } from './request-harness';

/** One section of an overview as the wire carries it. */
export interface SectionWire {
  state: string;
  count: number | null;
  sourceOperationId: string | null;
  reason: string | null;
}

export interface OverviewWire {
  asOf: string;
  department?: { id: string; code: string; name: string };
  scope?: { departments: number };
  sections: Record<string, SectionWire>;
}

export const OVERVIEW_PATHS = {
  employee: '/api/v1/dashboards/employee',
  manager: '/api/v1/dashboards/manager',
  itAdmin: '/api/v1/dashboards/it-admin',
  superAdmin: '/api/v1/dashboards/super-admin',
} as const;

/**
 * The role overviews (`US-12-15` AC-2, AC-3, AC-4, AC-7) over HTTP on PostgreSQL: the people, seats, tasks, reports, departures,
 * transfers and notices the overviews count, each made through the route or service that makes it, except the open tasks, which are
 * written as a request or a return leaves them (the real gate of requests is not driven here).
 */
export class DashboardHarness extends NoticeHarness {
  overview = (path: string, account: ApiAccount | null) => {
    const call = request(this.server()).get(path);

    return account ? call.set(this.as(account)) : call;
  };

  async overviewOf(path: string, account: ApiAccount): Promise<OverviewWire> {
    const response = await this.overview(path, account);
    if (response.status !== 200) throw new Error(`overview: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<OverviewWire>(response);
  }

  /** The total of an existing list read by the account, for comparing a count with the list that shows the rows. */
  async totalOf(path: string, account: ApiAccount, query: Record<string, string | number> = {}): Promise<number> {
    const response = await request(this.server()).get(path).query(query).set(this.as(account));
    if (response.status !== 200) throw new Error(`list ${path}: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ pagination: { totalItems: number } }>(response).pagination.totalItems;
  }

  /** The items of an existing list read by the account (one page of 100). */
  async itemsOf<T>(path: string, account: ApiAccount, query: Record<string, string | number> = {}): Promise<T[]> {
    const response = await request(this.server())
      .get(path)
      .query({ pageSize: 100, ...query })
      .set(this.as(account));
    if (response.status !== 200) throw new Error(`list ${path}: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ items: T[] }>(response).items;
  }

  inDays = (days: number): string => addDays(this.today(), days);

  /** A person of the department with an account holding `roles`, joined long ago. */
  async employeeIn(department: Department, code: string, roles: string[] = ['EMPLOYEE']): Promise<Person> {
    return this.worker(department, code, roles);
  }

  /** A seat of the person on the target from long ago, recorded by the baseline; with `end`, a time-limited right. */
  async rightOf(person: Person, code: string, target: { subscriptionId?: string; planId?: string }, end?: string) {
    await this.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [person.employeeId]);
    await this.written(target, [
      {
        employee_code: code,
        account_identifier: `${code.toLowerCase()}@acme.vn`,
        granted_on: '2026-01-05',
        ...(end ? { expected_end_date: end } : {}),
      },
    ]);
    const found = (
      await this.assignmentsOf(
        target.subscriptionId ? { subscriptionId: target.subscriptionId } : { planId: target.planId ?? '' },
      )
    ).find((assignment) => assignment.employeeId === person.employeeId);
    if (!found) throw new Error(`no seat of ${code}`);

    return found.id;
  }

  /**
   * A task of the seat that is not finished, with the IT Admin in charge by default: a grant answers for a request, a revocation for
   * the return that opened it (the columns the database asks of each).
   */
  async openTask(assignmentId: string, kind: 'GRANT' | 'REVOKE', responsible: string | null): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id, revocation_source,
                                       default_responsible_employee_id, max_attempts, created_by_app_user_id, updated_at)
       SELECT gen_random_uuid(), a.organization_id, a.id, $2::"ProvisioningTaskKind", 'MANUAL', 'QUEUED',
              CASE WHEN $2 = 'GRANT' THEN gen_random_uuid() END,
              CASE WHEN $2 = 'REVOKE' THEN 'RETURN'::"RevocationSource" END,
              $3::uuid, 4, a.created_by_app_user_id, now()
         FROM license_assignments a WHERE a.id = $1
       RETURNING id`,
      [assignmentId, kind, responsible],
    );

    return rows[0].id;
  }

  /** A SaaS error report the account sends about its right (201). */
  async reportOn(account: ApiAccount, assignmentId: string): Promise<string> {
    const response = await request(this.server())
      .post('/api/v1/saas-issues')
      .set(this.as(account))
      .send({
        assignmentId,
        category: 'NO_ACCESS',
        impact: 'UNUSABLE',
        description: 'I cannot open the workspace: it says the account is not allowed.',
        occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
      });
    if (response.status !== 201) throw new Error(`report: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ id: string }>(response).id;
  }

  /** The transfer of the person to the department from today, recorded by the Super Admin; the review opens with it. */
  moveToday(person: Person, to: Department) {
    return this.recorded({
      employeeId: person.employeeId,
      toDepartmentId: to.id,
      effectiveOn: this.today(),
      groundsNote: this.groundsNote,
    });
  }

  /** Every operation id of the committed OpenAPI document. */
  documentedOperationIds(): Set<string> {
    const document = JSON.parse(readFileSync(join(__dirname, '..', '..', 'openapi.json'), 'utf8')) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };

    return new Set(
      Object.values(document.paths).flatMap((item) =>
        Object.values(item).flatMap((operation) => (operation.operationId ? [operation.operationId] : [])),
      ),
    );
  }
}
