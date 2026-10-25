import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { AssignmentService } from '../assignment/assignment.service';
import { WITHDRAWAL_CANCEL_REASON, type GrantCancellation } from '../licensing.types';
import { BENEFICIARY_LEFT_CANCEL_REASON, type GrantCancelCause } from '../licensing-open-grants.types';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { grantCancelAction } from './grant-cancellation.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.record';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

/** What cancels the grant of a request: why, and for a beneficiary who left the evidence that the work was undone. */
export interface GrantCancelInput {
  organizationId: string;
  requestId: string;
  employeeId?: string;
  now: Date;
  /** Why the request ends; the requester's withdrawal when not given. */
  cause?: GrantCancelCause;
  /** What the IT Admin did to undo a grant being worked (took the invitation back, stopped the work): kept in the audit event. */
  evidence?: string;
}

/**
 * What becomes of the grant of a request that ends before it is done: its requester withdrew it (`US-05-08` AC-3, AC-5, AC-9) or the
 * person it was for left (`US-03-04` AC-25). A task nobody has worked (queued, or waiting for its retry) is cancelled with its
 * assignment at once: the seat is free again and the task ends as cancelled, never as failed (`FR-2.5`). A task being worked is not
 * cancelled by a withdrawal: the withdrawal waits for its result; for a beneficiary who left it is cancelled, only with the evidence
 * that the work was undone. A task that is done cannot be undone by closing the request: the way back is a revocation or a return,
 * which names the assignment the grant made. A task that failed is left for the IT Admin when the requester withdrew, who closes it as
 * cancelled (`ProvisioningDecisionService.cancel`), and cancelled with the request when the beneficiary left. Everything runs in the
 * transaction of the request, which holds the lock of the request; the lock of the task is taken first (`lockGrantOf`) so the order
 * of locks is the one of the decisions of the IT Admin.
 */
@Injectable()
export class ProvisioningCancellationService {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly assignments: AssignmentService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Locks the grant task of the request, if it has one, before the lock of the request itself; the task of one person of a
   * request for a group when `employeeId` names them.
   */
  async lockGrantOf(tx: DbTx, requestId: string, employeeId?: string): Promise<void> {
    await this.tasks.lockGrantOfRequest(tx, requestId, employeeId);
  }

  /** The seat the grant of the request made, when that grant is done; null for a request that has no grant or whose grant is not done. */
  async completedGrantOf(tx: DbTx, requestId: string, employeeId?: string): Promise<string | null> {
    const task = await this.tasks.lockGrantOfRequest(tx, requestId, employeeId);

    return task?.status === 'COMPLETED' ? task.assignmentId : null;
  }

  /** Throws AssignmentNotFoundError and AssignmentNotOpenError. */
  async cancelForWithdrawal(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: GrantCancelInput,
  ): Promise<GrantCancellation> {
    const task = await this.tasks.lockGrantOfRequest(tx, input.requestId, input.employeeId);
    if (!task) return { status: 'NO_TASK' };

    return this.decide(tx, actor, task, input);
  }

  private async decide(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    task: ProvisioningTaskRecord,
    input: GrantCancelInput,
  ): Promise<GrantCancellation> {
    const cause = input.cause ?? 'REQUESTER_WITHDREW';
    switch (grantCancelAction(task.status, cause, input.evidence !== undefined)) {
      case 'RUNNING':
        return { status: 'RUNNING' };
      case 'EVIDENCE_REQUIRED':
        return { status: 'EVIDENCE_REQUIRED' };
      case 'COMPLETED':
        return { status: 'COMPLETED', assignmentId: task.assignmentId };
      case 'ENDED':
        return { status: 'ENDED' };
      case 'WAIT_FOR_IT_ADMIN':
        return { status: 'FAILED', taskId: task.id };
      case 'CANCEL': {
        const reason = cause === 'BENEFICIARY_LEFT' ? BENEFICIARY_LEFT_CANCEL_REASON : WITHDRAWAL_CANCEL_REASON;
        await this.assignments.cancel(tx, actor, {
          organizationId: input.organizationId,
          assignmentId: task.assignmentId,
          requestId: input.requestId,
          now: input.now,
        });
        await this.tasks.markCancelled(tx, task.id, actor.appUserId, reason, input.now);
        await this.audit.record(
          tx,
          licensingAuditEvent(
            actor,
            input.organizationId,
            'PROVISIONING_TASK.CANCELLED',
            'ProvisioningTask',
            task.id,
            { status: task.status, attempts: task.attempts },
            {
              status: 'CANCELLED',
              taskKind: task.kind,
              requestId: input.requestId,
              closeReason: reason,
              ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
            },
          ),
        );

        return { status: 'CANCELLED', taskId: task.id, taskStatus: task.status };
      }
    }
  }
}
