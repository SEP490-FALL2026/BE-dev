import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AssignmentService } from '../../assignment/assignment.service';
import { ProvisioningTaskStateError } from '../../public/licensing.errors';
import {
  GrantRequestGateHook,
  RevocationListeners,
  type GrantRequestGate,
} from '../../public/licensing.extension-points';
import { WITHDRAWAL_CANCEL_REASON } from '../../public/licensing.types';
import { assertDecidable, assertHandOffAllowed } from '../failure.policy';
import { cleanFailureReason } from '../provisioning.policy';
import { toRevocationFacts, type ProvisioningTaskRecord } from '../provisioning-task.types';
import { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { ProvisioningTaskViewService, type TaskView } from '../provisioning-task-view.service';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';

/**
 * The decisions of an IT Admin on a task that failed (`US-07-04` AC-8→AC-10, AC-14): try again on the same channel,
 * hand a connector task to a person with the evidence, or close it as failed with a reason. Each is made on a failed task
 * only, and nothing decides for the IT Admin or by time. Closing is the end: a grant that is closed leaves its
 * assignment as a failed one and the seat free; a revocation that is closed leaves its assignment as it was. When the
 * requester withdrew the request while the grant had failed, none of those three is left: the task is closed as cancelled
 * (`cancel`), never as failed (`US-05-08` AC-9). Every decision is one transaction with its audit event, by an IT Admin (the
 * frame judges the role, F13). Locks: the task, then the request (its outcome), then the subscription and the assignment of the
 * seat; the grant takes the request before the subscription, so no path takes the subscription before the request (F25).
 */
@Injectable()
export class ProvisioningDecisionService {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly views: ProvisioningTaskViewService,
    private readonly assignments: AssignmentService,
    private readonly gate: GrantRequestGateHook,
    private readonly revocation: RevocationListeners,
  ) {}

  /** Puts the failed task back in the queue of its channel. Throws ProvisioningTaskNotFoundError, ProvisioningTaskStateError. */
  async retry(actor: AuthenticatedPrincipal, id: string): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      check: (locked) => assertDecidable(locked.status),
      write: async ({ tx, task: locked }) => {
        await this.refuseWhileWithdrawing(tx, locked);
        await this.repo.markRetried(tx, locked.id);

        return {
          action: 'RETRY_REQUESTED',
          after: { status: 'QUEUED', channel: locked.channel, failureKind: locked.failureKind, attempts: 0 },
        };
      },
    });

    return (await this.views.views([task]))[0];
  }

  /**
   * Hands a failed connector task to a person: only the channel changes, with who handed it and when; the last error, the failure
   * kind and reason and the tries made stay with the task. The evidence is asked when the manual work completes, not here (F08,
   * `QĐ-90a`). Throws
   * ProvisioningTaskAlreadyManualError and the errors of `retry`.
   */
  async handOff(actor: AuthenticatedPrincipal, id: string): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      check: (locked) => {
        assertDecidable(locked.status);
        assertHandOffAllowed(locked.channel);
      },
      write: async ({ tx, task: locked, now }) => {
        await this.refuseWhileWithdrawing(tx, locked);
        await this.repo.markHandedOff(tx, locked.id, actor.appUserId, now);

        return {
          action: 'HANDED_OFF',
          after: { status: 'QUEUED', channel: 'MANUAL', failureKind: locked.failureKind },
        };
      },
    });

    return (await this.views.views([task]))[0];
  }

  /**
   * Closes the failed task for good, with the reason. A grant becomes a failed assignment and its seat is free again; the
   * request, its commitment and the notice to the requester are for the modules that own them, which read the audit
   * event. Throws ProvisioningReasonRequiredError and the errors of `retry`.
   */
  async closeFailed(actor: AuthenticatedPrincipal, id: string, input: { reason: string }): Promise<TaskView> {
    const reason = cleanFailureReason(input.reason);
    const task = await this.frame.work(actor, id, {
      check: (locked) => assertDecidable(locked.status),
      write: async ({ tx, task: locked, organizationId, now }) => {
        await this.refuseWhileWithdrawing(tx, locked);
        if (locked.kind === 'GRANT' && locked.requestId !== null) {
          // The request is locked (by its outcome) before the subscription and the assignment: the grant of another person of a
          // request for a group takes the request and then the same subscription, so the other order is a cycle (F25).
          await this.gate.get().reportOutcome(tx, locked.requestId, 'FAILED', locked.assignment.employeeId);
          await this.assignments.closeFailed(tx, actor, {
            organizationId,
            assignmentId: locked.assignmentId,
            requestId: locked.requestId,
            now,
          });
        }
        await this.repo.markClosedFailed(tx, locked.id, actor.appUserId, reason, now);
        if (locked.kind === 'REVOKE') {
          // The modules that extend a revocation learn that it will not be done: the seat is still held.
          await this.revocation.emit(tx, {
            moment: 'CLOSED_FAILED',
            task: { ...toRevocationFacts(locked), status: 'CLOSED_FAILED' },
            closeReason: reason,
            now,
            actor,
          });
        }

        return {
          action: 'CLOSED_FAILED',
          after: {
            status: 'CLOSED_FAILED',
            taskKind: locked.kind,
            requestId: locked.requestId,
            failureKind: locked.failureKind,
            closeReason: reason,
            // A revocation that could not be done leaves the right where it was: the seat is still taken.
            ...(locked.kind === 'REVOKE' ? { assignmentStillOpen: true } : {}),
          },
        };
      },
    });

    return (await this.views.views([task]))[0];
  }

  /**
   * Closes the failed task of a request its requester withdrew as cancelled, and not as failed: the request ends as
   * withdrawn, what was held for it goes back, and the assignment becomes a cancelled one, so the seat is free again
   * (`US-05-08` AC-9). Throws ProvisioningTaskStateError (`NOT_FAILED`, `NO_WITHDRAWAL`) and the errors of `retry`.
   */
  async cancel(actor: AuthenticatedPrincipal, id: string): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      check: (locked) => assertDecidable(locked.status),
      write: async ({ tx, task: locked, organizationId, now }) => {
        if (
          locked.kind !== 'GRANT' ||
          locked.requestId === null ||
          !(await this.gate.get().reportCancelled(tx, locked.requestId, locked.assignment.employeeId))
        ) {
          throw new ProvisioningTaskStateError('NO_WITHDRAWAL');
        }
        await this.assignments.cancel(tx, actor, {
          organizationId,
          assignmentId: locked.assignmentId,
          requestId: locked.requestId,
          now,
        });
        await this.repo.markCancelled(tx, locked.id, actor.appUserId, WITHDRAWAL_CANCEL_REASON, now);

        return {
          action: 'CANCELLED',
          after: {
            status: 'CANCELLED',
            taskKind: locked.kind,
            requestId: locked.requestId,
            failureKind: locked.failureKind,
            closeReason: WITHDRAWAL_CANCEL_REASON,
          },
        };
      },
    });

    return (await this.views.views([task]))[0];
  }

  /**
   * A request whose requester withdrew has one decision left: cancelling. A revocation answers for no request, so nothing
   * withdraws it. Throws ProvisioningTaskStateError.
   */
  private async refuseWhileWithdrawing(
    tx: Parameters<GrantRequestGate['isWithdrawing']>[0],
    task: ProvisioningTaskRecord,
  ) {
    if (
      task.requestId !== null &&
      (await this.gate.get().isWithdrawing(tx, task.requestId, task.assignment.employeeId))
    ) {
      throw new ProvisioningTaskStateError('WITHDRAWAL_PENDING');
    }
  }
}
