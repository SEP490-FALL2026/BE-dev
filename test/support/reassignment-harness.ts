import request from 'supertest';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import type { NewOrganizationChange } from '../../src/modules/organization/organization.types';
import { StepReassignmentService } from '../../src/modules/requests/reassignment/step-reassignment.service';
import {
  StepRedeterminationSweepService,
  type SweepResult,
} from '../../src/modules/requests/step-redetermination-sweep.service';
import type { ApiAccount } from './api-accounts';
import { SpendHarness } from './spend-harness';

/** A step as the database keeps it, with the moments the deadline and the wait are measured from. */
export interface StepFacts {
  id: string;
  state: string;
  assignee_employee_id: string | null;
  waiting_reason: string | null;
  routing_row: number;
  same_person_as_spend: boolean;
  created_at: Date;
  assigned_at: Date | null;
  waiting_since: Date | null;
}

export interface AuditRow {
  action: string;
  resource_id: string;
  correlation_id: string;
  actor_kind: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export interface WaitWire {
  requestId: string;
  stepId: string;
  stepKind: string;
  waitingReason: string;
  configurationHint: string | null;
  waitingSince: string;
  alertedAt: string | null;
  requester: { employeeId: string };
  department: { id: string; code: string };
}

/**
 * The spend harness with what the reassignment of steps needs: a change of the organization made the way the transfer record
 * will make it (the rows written and the change announced in one transaction), a person who leaves, the sweep of the worker run
 * by hand, and the steps and the audit events read back. No assertion lives here: the specs make them.
 */
export class ReassignmentHarness extends SpendHarness {
  private runner = () => this.ctx.app.get(TransactionRunner, { strict: false });
  private organization = () => this.ctx.app.get(OrganizationService, { strict: false });

  /** Announces a change of the organization in a transaction of its own, as the item that writes it will in its own. */
  async emit(change: NewOrganizationChange): Promise<void> {
    await this.runner().run((tx) => this.organization().emitChange(tx, change));
  }

  /**
   * The person moves to the department from today: the placement they have ends today (it began long before), a new one
   * begins today, and, unless `announce` is false, the change is announced in the same transaction.
   */
  async moveTo(employeeId: string, departmentId: string, options: { announce?: boolean } = {}): Promise<void> {
    const today = this.today();
    await this.runner().run(async (tx) => {
      const [old] = await tx.$queryRaw<{ id: string; organization_id: string; department_id: string }[]>`
        SELECT id, organization_id, department_id FROM employee_placements
         WHERE employee_id = ${employeeId}::uuid AND valid_to IS NULL`;
      await tx.$executeRaw`UPDATE employee_placements SET valid_from = valid_from - 30 WHERE id = ${old.id}::uuid`;
      await tx.$executeRaw`UPDATE employee_placements SET valid_to = ${today}::date WHERE id = ${old.id}::uuid`;
      const [created] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
        VALUES (gen_random_uuid(), ${old.organization_id}::uuid, ${employeeId}::uuid, ${departmentId}::uuid,
                ${today}::date)
        RETURNING id`;
      if (options.announce === false) return;
      await this.organization().emitChange(tx, {
        kind: 'PLACEMENT_START',
        placementId: created.id,
        employeeId,
        fromDepartmentId: old.department_id,
        toDepartmentId: departmentId,
        effectiveOn: today,
      });
    });
  }

  /** The person has left the company: the status is written and the change announced together. */
  async leave(employeeId: string, options: { announce?: boolean } = {}): Promise<void> {
    await this.runner().run(async (tx) => {
      await tx.$executeRaw`UPDATE employees SET status = 'TERMINATED'::"EmployeeStatus" WHERE id = ${employeeId}::uuid`;
      if (options.announce === false) return;
      await this.organization().emitChange(tx, { kind: 'EMPLOYEE_LEFT', employeeId, effectiveOn: this.today() });
    });
  }

  /** Nobody heads the department from today, as the IT Admin records it. */
  vacateHead = (departmentId: string) =>
    request(this.server())
      .post(`/api/v1/departments/${departmentId}/head-vacancies`)
      .set(this.as(this.it1))
      .send({ effectiveFrom: this.today() });

  /** A sweep of the worker that has not run the pass of the day yet, which is what the first sweep of a worker does. */
  freshSweep(): StepRedeterminationSweepService {
    const app = this.ctx.app;

    return new StepRedeterminationSweepService(
      app.get(StepReassignmentService, { strict: false }),
      app.get(OrganizationService, { strict: false }),
    );
  }

  sweep = (): Promise<SweepResult> => this.freshSweep().sweep();

  async stepOf(requestId: string, kind: string): Promise<StepFacts> {
    const { rows } = await this.ctx.sql.query<StepFacts>(
      `SELECT id, state::text, assignee_employee_id, waiting_reason, routing_row, same_person_as_spend, created_at,
              assigned_at, waiting_since
         FROM access_request_steps WHERE request_id = $1 AND kind = $2::"AccessRequestStepKind" ORDER BY sequence DESC LIMIT 1`,
      [requestId, kind],
    );

    return rows[0];
  }

  /** The audit events of an action about a resource (or all of the action), oldest first. */
  async audit(action: string, resourceId?: string): Promise<AuditRow[]> {
    const { rows } = await this.ctx.sql.query<AuditRow>(
      `SELECT action, resource_id, correlation_id, actor_kind::text, before, after FROM audit_events
        WHERE action = $1 AND ($2::text IS NULL OR resource_id = $2) ORDER BY occurred_at, id`,
      [action, resourceId ?? null],
    );

    return rows;
  }

  /** Who holds the approval role now, by employee id; null when nobody does. */
  async getApprovalRoleHolder(role: string): Promise<string | null> {
    const { rows } = await this.ctx.sql.query<{ employee_id: string }>(
      `SELECT employee_id FROM approval_role_holders WHERE role = $1::"ApprovalRole" AND held_until IS NULL`,
      [role],
    );

    return rows[0]?.employee_id ?? null;
  }

  async requestRow(requestId: string): Promise<{ state: string; policy: unknown; department_id: string }> {
    const { rows } = await this.ctx.sql.query<{ state: string; policy: unknown; department_id: string }>(
      `SELECT state::text, policy, department_id FROM access_requests WHERE id = $1`,
      [requestId],
    );

    return rows[0];
  }

  waits = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/controlled-waits').query(query).set(this.as(account));
  grantRoleTo = (appUserId: string, role: string) =>
    request(this.server())
      .post(`/api/v1/app-users/${appUserId}/role-grants`)
      .set({ Authorization: `Bearer ${this.admin}` })
      .send({ role });
  revokeRoleFrom = (appUserId: string, role: string) =>
    request(this.server())
      .delete(`/api/v1/app-users/${appUserId}/role-grants/${role}`)
      .set({ Authorization: `Bearer ${this.admin}` });

  /** The day after `today()`, in the calendar of the organization. */
  tomorrow = (): string => new Date(Date.parse(`${this.today()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
