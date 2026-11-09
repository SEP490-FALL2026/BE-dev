import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { HandoverOverdueService } from '../../src/modules/licensing/handover/handover-overdue.service';
import { LicensingApi } from '../../src/modules/licensing/public/licensing.api';
import { LicensingHandoverApi } from '../../src/modules/licensing/public/licensing-handover.api';
import type {
  OpenedHandoverDuties,
  OpenHandoverDutiesInput,
} from '../../src/modules/licensing/public/licensing-handover.types';
import type {
  OpenedRevocation,
  RevocationContext,
  RevocationDecision,
} from '../../src/modules/licensing/public/licensing.types';
import type { ApiAccount } from './api-accounts';
import { changeRoleTo } from './builders/account.builder';
import { assignmentIdOf, importSeats } from './builders/seat.builder';
import type { Person } from './request-harness';
import { TransferHarness } from './transfer-harness';

export interface DutyWire {
  id: string;
  assignmentId: string;
  application: { id: string; name: string };
  plan: { id: string; name: string };
  employee: { id: string; employeeCode: string; fullName: string };
  source: string;
  role: 'DEPARTMENT_HEAD' | 'REQUESTER' | 'IT_ADMIN';
  status: 'OPEN' | 'CONFIRMED' | 'CANCELLED';
  dataLoss: boolean;
  dueOn: string;
  overdue: boolean;
  flaggedUnconfirmed: boolean;
  waitingReason: 'NO_HEAD' | 'NO_SUCCESSOR' | null;
  canConfirm: boolean;
  noticeText?: string | null;
  confirmer?: { id: string } | null;
  confirmation?: {
    value: string;
    role: string;
    confirmedBy: { id: string };
    confirmedAt: string;
    late: boolean;
  } | null;
  cancellation?: { cancelledAt: string; reason: string } | null;
}

export interface DutyRow {
  id: string;
  assignment_id: string;
  employee_id: string;
  source: string;
  confirmer_role: string;
  confirmer_employee_id: string | null;
  department_id: string | null;
  leaver_is_head: boolean;
  resolve_on: string | null;
  due_on: string;
  confirmed_value: string | null;
  confirmed_by_employee_id: string | null;
  confirmed_role: string | null;
  confirmed_late: boolean;
  overdue_noticed_at: Date | null;
  proceeded_unconfirmed_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  notice_text: string | null;
  data_loss: boolean;
}

export interface OpenOptions {
  decision?: Partial<RevocationDecision>;
  context?: RevocationContext;
  actor?: AuthenticatedPrincipal;
  now?: Date;
}

/**
 * The transfer harness with what the tests of the handover confirmation need: seats for the people it makes, the call that a source
 * module makes to open a revocation or the handover of a person who leaves, the calls of the three routes and what the duties look
 * like in the database. No assertion lives here.
 */
export class HandoverHarness extends TransferHarness {
  actorOf(account: ApiAccount, roles: string[] = ['IT_ADMIN']): AuthenticatedPrincipal {
    return {
      subject: account.appUserId,
      appUserId: account.appUserId,
      sessionId: randomUUID(),
      employeeId: account.employeeId,
      directRoles: roles,
      roles,
    };
  }

  /**
   * A seat of an existing person that began long ago, so ending it gives the seat back today; returns its assignment. The
   * baseline is imported and the seat found through the services (T2.2): the suites standing on it do not prove the import.
   */
  async seatOf(person: Person, target: { subscriptionId?: string; planId?: string }, code: string): Promise<string> {
    // The person joined long ago, so a grant date in the past is right.
    await this.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [person.employeeId]);
    await importSeats(
      this.ctx,
      this.it1.accessToken,
      target,
      this.file([
        { employee_code: code, account_identifier: `${code.toLowerCase()}@acme.vn`, granted_on: '2026-01-05' },
      ]),
    );
    const found = await assignmentIdOf(
      this.ctx,
      target.subscriptionId ? { subscriptionId: target.subscriptionId } : { planId: target.planId ?? '' },
      person.employeeId,
    );
    if (!found) throw new Error(`no seat of ${code}`);

    return found;
  }

  /** What the plan says about losing data and what to do before taking it away. */
  async describePlan(subscriptionId: string, dataLoss: boolean, note: string | null): Promise<string> {
    const planId = await this.planOf(subscriptionId);
    await this.ctx.sql.query(`UPDATE plans SET data_loss_on_removal = $2, revocation_note = $3 WHERE id = $1`, [
      planId,
      dataLoss,
      note,
    ]);

    return planId;
  }

  /** What a source module does in its own transaction: ask the licensing facade to open the revocation of a seat. */
  open = (assignmentId: string, source: string | undefined, options: OpenOptions = {}): Promise<OpenedRevocation> => {
    const facade = this.ctx.app.get(LicensingApi);
    const actor = options.actor ?? this.actorOf(this.it1);

    return this.ctx.app.get(TransactionRunner).run((tx) =>
      facade.openRevocation(tx, actor, {
        assignmentId,
        source,
        decision: { decidedRole: 'MANAGER', ...options.decision },
        ...(options.context ? { context: options.context } : {}),
        ...(options.now ? { now: options.now } : {}),
      }),
    );
  };

  /** What the record of a departure does when it is saved: opens the handover of the seats of the person who leaves. */
  openDuties = (
    input: Omit<OpenHandoverDutiesInput, 'caseRefId'> & { caseRefId?: string | null },
    actor: AuthenticatedPrincipal = this.actorOf(this.it1),
  ): Promise<OpenedHandoverDuties> =>
    this.ctx.app
      .get(TransactionRunner)
      .run((tx) => this.ctx.app.get(LicensingHandoverApi).openHandoverDuties(tx, actor, { caseRefId: null, ...input }));

  reconcileDuties = (caseRefId: string, dueOn: string, lastWorkingDay?: string) =>
    this.ctx.app.get(TransactionRunner).run((tx) =>
      this.ctx.app.get(LicensingHandoverApi).reconcileHandoverDuties(tx, this.actorOf(this.it1), {
        caseRefId,
        dueOn,
        ...(lastWorkingDay ? { lastWorkingDay } : {}),
      }),
    );

  cancelDuties = (caseRefId: string, reason: string) =>
    this.ctx.app
      .get(TransactionRunner)
      .run((tx) =>
        this.ctx.app.get(LicensingHandoverApi).cancelHandoverDuties(tx, this.actorOf(this.it1), { caseRefId, reason }),
      );

  /** The reminder of the hour, run by hand. */
  noticeOverdue = (now: Date = new Date()) => this.ctx.app.get(HandoverOverdueService).noticeOverdue(now);

  revoked = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server())
      .post(`/api/v1/provisioning-tasks/${id}/revocation-completion`)
      .set(this.as(account))
      .send(body);

  duties = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/handover-duties${query}`).set(this.as(account));
  duty = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/handover-duties/${id}`).set(this.as(account));
  confirmDuty = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/handover-duties/${id}/confirmations`).set(this.as(account)).send(body);

  /** The duties as the database keeps them, oldest first; of one seat, or of all. */
  async dutyRows(assignmentId?: string): Promise<DutyRow[]> {
    const { rows } = await this.ctx.sql.query<DutyRow>(
      `SELECT id, assignment_id, employee_id, source::text AS source, confirmer_role::text AS confirmer_role,
              confirmer_employee_id, department_id, leaver_is_head, to_char(resolve_on, 'YYYY-MM-DD') AS resolve_on,
              to_char(due_on, 'YYYY-MM-DD') AS due_on, confirmed_value::text AS confirmed_value,
              confirmed_by_employee_id, confirmed_role::text AS confirmed_role, confirmed_late, overdue_noticed_at,
              proceeded_unconfirmed_at, cancelled_at, cancel_reason, notice_text, data_loss
         FROM handover_duties WHERE ($1::uuid IS NULL OR assignment_id = $1) ORDER BY created_at, id`,
      [assignmentId ?? null],
    );

    return rows;
  }

  /** The task a seat has and is alive (not closed as failed, not cancelled), or null. */
  async liveTaskOf(assignmentId: string): Promise<string | null> {
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `SELECT id FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE'
          AND status NOT IN ('CLOSED_FAILED', 'CANCELLED')`,
      [assignmentId],
    );

    return rows[0]?.id ?? null;
  }

  async assignmentRow(id: string) {
    return (
      await this.ctx.sql.query<{ valid_until: string | null; failed_at: Date | null }>(
        `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until, failed_at FROM license_assignments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  }

  async auditActions(resourceId: string): Promise<string[]> {
    const { rows } = await this.ctx.sql.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id`,
      [resourceId],
    );

    return rows.map((row) => row.action);
  }

  /** Makes the person the head of the department from the day (the route of the Super Admin accepts a day to come). */
  async makeHeadFrom(department: { id: string }, person: Person, day: string): Promise<void> {
    await changeRoleTo(this.ctx, this.admin, person.employeeId, 'MANAGER');
    await request(this.server())
      .post(`/api/v1/departments/${department.id}/head-assignments`)
      .set({ Authorization: `Bearer ${this.admin}` })
      .send({ employeeId: person.employeeId, effectiveFrom: day })
      .expect(200);
  }
}
