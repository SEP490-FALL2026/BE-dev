import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { RevocationListeners, type RevocationEvent } from '../../licensing/public/licensing.extension-points';
import type { RevocationTaskFacts } from '../../licensing/public/licensing.types';
import { OrganizationApi } from '../../organization/public/organization.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { handoverGate } from './handover.policy';
import { ReturnHandoverPendingError } from './return-request.errors';
import { ReturnRequestRepo } from './return-request.repo';

/** The name the return takes among the listeners of a revocation. */
const RETURN_REVOCATION_LISTENER = 'requests.return-request';

/**
 * What the revocation of a seat that was returned tells the return (`US-05-13` AC-1, AC-6, AC-8): the module of requests adds this to
 * licensing's `RevocationListeners` when it starts, after the handover confirmation, so licensing never imports it. The task is made
 * by the return itself, so nothing is done when it opens. Taking the task is not stopped; completing it is, while the handover that loses data is not confirmed and its deadline
 * has not passed, and a completion after the deadline goes through and flags the return. A completed task completes the return,
 * and a task the IT Admin closed as failed fails it, with the reason: the seat is still held, and nothing says it was returned.
 * Every statement runs in the transaction of the task, so the two never disagree.
 */
@Injectable()
export class ReturnRevocationHook implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [RevocationListeners] as const;

  constructor(
    private readonly returns: ReturnRequestRepo,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly revocation: RevocationListeners,
  ) {}

  onModuleInit(): void {
    this.revocation.add(RETURN_REVOCATION_LISTENER, (tx, event) => this.heard(tx, event));
  }

  private heard(tx: DbTx, event: RevocationEvent): Promise<void> {
    switch (event.moment) {
      case 'OPENED':
        // The task is made by the return itself: nothing is done when it opens.
        return Promise.resolve();
      case 'BEFORE_WORK':
        return this.beforeWork(tx, event.task, event.now);
      case 'AFTER_WORK':
        return this.afterWork(tx, event.task, event.now, event.actor);
      case 'CLOSED_FAILED':
        return this.afterClosedFailed(tx, event.task, event.closeReason, event.now, event.actor);
    }
  }

  /** Throws ReturnHandoverPendingError when the task is about to be completed and the handover is still to be confirmed. */
  async beforeWork(tx: DbTx, task: RevocationTaskFacts, now: Date): Promise<void> {
    // Before the task is taken it is not yet in progress: only its completion is asked about the handover.
    if (task.status !== 'IN_PROGRESS') return;
    const waiting = await this.returns.findAwaitingByTask(task.id, tx);
    if (!waiting) return;

    const gate = handoverGate({
      required: waiting.handoverRequired,
      confirmed: waiting.handoverConfirmedAt !== null,
      dueOn: waiting.handoverDueOn,
      today: await this.organization.businessToday(now, tx),
    });
    if (gate === 'BLOCKED' && waiting.handoverDueOn !== null) {
      throw new ReturnHandoverPendingError(waiting.id, waiting.handoverDueOn);
    }
  }

  async afterWork(tx: DbTx, task: RevocationTaskFacts, now: Date, actor: AuthenticatedPrincipal): Promise<void> {
    if (task.status !== 'COMPLETED') return;
    const waiting = await this.returns.lockAwaitingByTask(tx, task.id);
    if (!waiting) return;

    // Completed without the confirmation, which could only be after its deadline: the return says so.
    const flagged = waiting.handoverRequired && waiting.handoverConfirmedAt === null;
    await this.returns.markCompleted(tx, waiting.id, now, flagged);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(actor, waiting.organizationId, 'RETURN_REQUEST.COMPLETED', 'RETURN_REQUEST', waiting.id, {
        returnRequestId: waiting.id,
        assignmentId: waiting.assignmentId,
        holderEmployeeId: waiting.holderEmployeeId,
        revocationTaskId: task.id,
        handoverFlagged: flagged,
      }),
    );
  }

  async afterClosedFailed(
    tx: DbTx,
    task: RevocationTaskFacts,
    closeReason: string,
    now: Date,
    actor: AuthenticatedPrincipal,
  ): Promise<void> {
    const waiting = await this.returns.lockAwaitingByTask(tx, task.id);
    if (!waiting) return;

    await this.returns.markFailed(tx, waiting.id, now, closeReason);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(actor, waiting.organizationId, 'RETURN_REQUEST.FAILED', 'RETURN_REQUEST', waiting.id, {
        returnRequestId: waiting.id,
        assignmentId: waiting.assignmentId,
        holderEmployeeId: waiting.holderEmployeeId,
        revocationTaskId: task.id,
        assignmentStillOpen: true,
      }),
    );
  }
}
