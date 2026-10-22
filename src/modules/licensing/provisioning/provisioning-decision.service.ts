import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AssignmentService } from '../assignment/assignment.service';
import { assertDecidable, assertHandOffAllowed } from './failure.policy';
import { cleanEvidence, cleanFailureReason } from './provisioning.policy';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { ProvisioningTaskViewService, type TaskView } from './provisioning-task-view.service';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

/**
 * The three decisions of an IT Admin on a task that failed (`US-07-04` AC-8→AC-10, AC-14): try again on the same channel,
 * hand a connector task to a person with the evidence, or close it as failed with a reason. Each is made on a failed task
 * only, and nothing decides for the IT Admin or by time. Only closing is the end: a grant that is closed leaves its
 * assignment as a failed one and the seat free; a revocation that is closed leaves its assignment as it was. Every
 * decision is one transaction with its audit event.
 */
@Injectable()
export class ProvisioningDecisionService {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly views: ProvisioningTaskViewService,
    private readonly assignments: AssignmentService,
  ) {}

  /** Puts the failed task back in the queue of its channel. Throws ProvisioningTaskNotFoundError, ProvisioningTaskStateError. */
  async retry(actor: AuthenticatedPrincipal, id: string): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      check: (locked) => assertDecidable(locked.status),
      write: async ({ tx, task: locked }) => {
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
   * Hands a failed connector task to a person, with the evidence that was given. The evidence is kept on the task and does
   * not enter the audit event. Throws ProvisioningEvidenceRequiredError, ProvisioningTaskAlreadyManualError and the errors
   * of `retry`.
   */
  async handOff(actor: AuthenticatedPrincipal, id: string, input: { evidence: string }): Promise<TaskView> {
    const evidence = cleanEvidence(input.evidence);
    const task = await this.frame.work(actor, id, {
      check: (locked) => {
        assertDecidable(locked.status);
        assertHandOffAllowed(locked.channel);
      },
      write: async ({ tx, task: locked, now }) => {
        await this.repo.markHandedOff(tx, locked.id, actor.appUserId, evidence, now);

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
        if (locked.kind === 'GRANT') {
          await this.assignments.closeFailed(tx, actor, {
            organizationId,
            assignmentId: locked.assignmentId,
            requestId: locked.requestId,
            now,
          });
        }
        await this.repo.markClosedFailed(tx, locked.id, actor.appUserId, reason, now);

        return {
          action: 'CLOSED_FAILED',
          after: {
            status: 'CLOSED_FAILED',
            taskKind: locked.kind,
            requestId: locked.requestId,
            failureKind: locked.failureKind,
            closeReason: reason,
          },
        };
      },
    });

    return (await this.views.views([task]))[0];
  }
}
