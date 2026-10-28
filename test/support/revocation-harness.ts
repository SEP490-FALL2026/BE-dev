import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { LicensingService } from '../../src/modules/licensing/licensing.service';
import type {
  OpenedRevocation,
  RevocationContext,
  RevocationDecision,
} from '../../src/modules/licensing/licensing.types';
import type { ApiAccount } from './api-accounts';
import { ProvisioningHarness, type TaskWire } from './provisioning-harness';

/** What a task of a revocation says of it on the wire, in a row of the list and in the detail. */
export interface RevocationBlockWire {
  source: string;
  reasonCount: number;
  completion: string | null;
  accessState: string | null;
  paidThroughOn: string | null;
  terminating: boolean;
  terminatingUntil: string | null;
  completionNote?: string | null;
  accessCutOn?: string | null;
  accessEvidence?: string | null;
  firstReason?: {
    decidedByEmployeeId: string | null;
    decidedRole: string;
    referenceKind: string | null;
    referenceId: string | null;
    note: string | null;
    decidedAt: string;
  } | null;
}
export type RevocationTaskWire = Omit<TaskWire, 'requestId'> & {
  requestId: string | null;
  revocation: RevocationBlockWire | null;
};

export interface OpenOptions {
  decision?: Partial<RevocationDecision>;
  context?: RevocationContext;
  actor?: AuthenticatedPrincipal;
  now?: Date;
}

/**
 * The provisioning harness with what the tests of a revocation need: seats that existed before today (so ending one frees the
 * seat today), the call that a source module makes to open a revocation, and the calls of the routes that work one. No
 * assertion lives here.
 */
export class RevocationHarness extends ProvisioningHarness {
  /** The caller as a source module has it: an account with the roles it holds. */
  actorOf(account: ApiAccount, roles: string[] = ['IT_ADMIN']): AuthenticatedPrincipal {
    return {
      subject: account.appUserId,
      appUserId: account.appUserId,
      sessionId: randomUUID(),
      employeeId: account.employeeId,
      directRoles: roles,
      derivedRoles: [],
      roles,
    };
  }

  /** What a source module does in its own transaction: ask the licensing facade to open the revocation of a seat. */
  open = (assignmentId: string, source: string | undefined, options: OpenOptions = {}): Promise<OpenedRevocation> => {
    const facade = this.ctx.app.get(LicensingService);
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

  /** A seat of a person that began long ago (a baseline row), so ending it gives the seat back today; returns its assignment. */
  async seat(target: { subscriptionId?: string; planId?: string }, code: string, grantedOn = '2026-01-05') {
    const employeeId = await this.person(code);
    await this.written(target, [
      { employee_code: code, account_identifier: `${code.toLowerCase()}@acme.vn`, granted_on: grantedOn },
    ]);
    const found = (
      await this.assignmentsOf(
        target.subscriptionId ? { subscriptionId: target.subscriptionId } : { planId: target.planId ?? '' },
      )
    ).find((assignment) => assignment.employeeId === employeeId);
    if (!found) throw new Error(`no seat of ${code}`);

    return found.id;
  }

  revoked = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server())
      .post(`/api/v1/provisioning-tasks/${id}/revocation-completion`)
      .set(this.as(account))
      .send(body);
  accessCut = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/provisioning-tasks/${id}/access-cut`).set(this.as(account)).send(body);

  async revocationOf(id: string): Promise<RevocationTaskWire> {
    return this.dataOf<{ task: RevocationTaskWire }>(await this.getTask(id).expect(200)).task;
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
      await this.ctx.sql.query<{ valid_from: string; valid_until: string | null; failed_at: Date | null }>(
        `SELECT to_char(valid_from, 'YYYY-MM-DD') AS valid_from, to_char(valid_until, 'YYYY-MM-DD') AS valid_until,
                failed_at FROM license_assignments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  }

  async reasonsOf(taskId: string) {
    return (
      await this.ctx.sql.query<{
        source: string;
        decided_role: string;
        reference_id: string | null;
        note: string | null;
      }>(
        `SELECT source, decided_role, reference_id, note FROM provisioning_task_reasons
          WHERE task_id = $1 ORDER BY created_at, id`,
        [taskId],
      )
    ).rows;
  }

  /** The days of the calendar of the organization, `days` from today. */
  inDays = (days: number): string => {
    const date = new Date(`${this.today()}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  };

  /** A fingerprint of every table a revocation must not touch: subscriptions, contracts, budgets and commitments. */
  async untouched(): Promise<Record<string, string>> {
    const tables = [
      'subscriptions',
      'contracts',
      'budget_versions',
      'budget_commitments',
      'budget_commitment_releases',
    ];
    const prints: Record<string, string> = {};
    for (const table of tables) {
      prints[table] = (
        await this.ctx.sql.query<{ print: string }>(
          `SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') AS print FROM ${table} t`,
        )
      ).rows[0].print;
    }

    return prints;
  }
}
