import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import type { RevocationHook, RevocationTaskFacts } from '../../licensing/licensing.types';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { handoverGate } from './handover.policy';
import { ReturnHandoverPendingError } from './return-request.errors';
import { ReturnRequestRepo } from './return-request.repo';

/**
 * What the revocation of a seat that was returned tells the return (`US-05-13` AC-1, AC-6, AC-8): the module of requests registers
 * this with licensing when it starts, so licensing never imports it. The task is made by the return itself, so nothing is done when
 * it opens. Taking the task is not stopped; completing it is, while the handover that loses data is not confirmed and its deadline
 * has not passed, and a completion after the deadline goes through and flags the return. A completed task completes the return,
 * and a task the IT Admin closed as failed fails it, with the reason: the seat is still held, and nothing says it was returned.
 * Every statement runs in the transaction of the task, so the two never disagree.
 */
@Injectable()
export class ReturnRevocationHook implements RevocationHook {
  constructor(
    private readonly returns: ReturnRequestRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
  ) {}

  onOpened(): Promise<void> {
    return Promise.resolve();
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
