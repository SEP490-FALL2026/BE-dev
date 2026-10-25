import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { AssignmentEndService } from '../assignment/assignment-end.service';
import { AssignmentNotOpenError, ProvisioningTaskStateError, SeatTargetNotFoundError } from '../licensing.errors';
import { nextStatus } from './provisioning.policy';
import { RegisteredRevocationHook } from './registered-revocation-hook.service';
import { assertRevocationTask, planAccessCut, planCompletion, type CompletionInput } from './revocation.policy';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { toRevocationFacts } from './provisioning-task.record';
import { ProvisioningTaskViewService, type TaskView } from './provisioning-task-view.service';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

/**
 * What a person does to a revocation they work (`US-07-05` AC-1→AC-5, AC-8, AC-19): complete it, which is the only thing that
 * gives the seat back, and cut the access of a K1 seat earlier than the end of its paid period. Each is one transaction with its
 * audit events, under the locks of the task, the subscription and the assignment in that order. Nothing here writes savings,
 * an invoice, a contract or a budget (`AC-17`): the seat goes back, and what that saves is for another module to record.
 */
@Injectable()
export class RevocationCompletionService {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly views: ProvisioningTaskViewService,
    private readonly ending: AssignmentEndService,
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly hook: RegisteredRevocationHook,
  ) {}

  /**
   * Completes the revocation the IT Admin took, the way its kind of provisioning says, and ends the assignment. Throws
   * ProvisioningTaskNotFoundError, ProvisioningTaskStateError, ProvisioningTaskNotManualError,
   * ProvisioningAnotherItAdminNeededError, RevocationCompletionError, ProvisioningEvidenceRequiredError, whatever the hook
   * throws and AssignmentNotOpenError.
   */
  async complete(actor: AuthenticatedPrincipal, id: string, input: CompletionInput): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      check: (locked) => {
        assertRevocationTask(locked.kind);
        nextStatus(locked.status, 'COMPLETE', locked.channel);
      },
      write: async ({ tx, task: locked, organizationId, now }) => {
        const facts = toRevocationFacts(locked);
        await this.hook.beforeWork(tx, facts, now);
        const [plan] = await this.catalog.getPlanRevocationInfo([locked.assignment.planId], tx);
        if (!plan) throw new SeatTargetNotFoundError('PLAN');
        const assignment = await this.ending.lock(tx, locked.assignmentId);
        const today = await this.organization.businessToday(now, tx);
        const done = planCompletion(input, { type: plan.provisioningType, startsOn: assignment.effectiveFrom, today });

        await this.tasks.markRevocationCompleted(tx, locked.id, actor.appUserId, done, now);
        await this.ending.end(tx, actor, { organizationId, assignment, until: done.endOn, taskId: locked.id });
        await this.hook.afterWork(tx, { ...facts, status: 'COMPLETED' }, now, actor);

        // The evidence and the notes stay on the task: the audit event says what was done, not what was written about it.
        return {
          action: 'REVOCATION_COMPLETED',
          after: {
            status: 'COMPLETED',
            taskKind: 'REVOKE',
            completion: done.completion,
            accessState: done.accessState,
            paidThroughOn: done.paidThroughOn,
            validUntil: done.endOn,
            completedBy: actor.appUserId,
          },
        };
      },
    });

    return (await this.views.views([task]))[0];
  }

  /**
   * Cuts the access of a K1 seat whose renewal was cancelled and whose access was left to run to the end of the paid period:
   * once, on a day that is not ahead, with the evidence. The seat ends that day when that is sooner than it ended. Throws
   * ProvisioningTaskNotFoundError, ProvisioningTaskStateError (`NOT_REVOCATION`, `NOT_TERMINATING`),
   * ProvisioningAnotherItAdminNeededError, RevocationCompletionError and ProvisioningEvidenceRequiredError.
   */
  async recordAccessCut(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { accessCutOn: BusinessDate; evidence: string },
  ): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      check: (locked) => {
        assertRevocationTask(locked.kind);
        if (locked.status !== 'COMPLETED' || locked.accessState !== 'UNTIL_PAID_END') {
          throw new ProvisioningTaskStateError('NOT_TERMINATING');
        }
      },
      write: async ({ tx, task: locked, organizationId, now }) => {
        const assignment = await this.ending.lock(tx, locked.assignmentId);
        if (assignment.validUntil === null) throw new AssignmentNotOpenError();
        const today = await this.organization.businessToday(now, tx);
        const cut = planAccessCut(input, {
          today,
          startsOn: assignment.effectiveFrom,
          validUntil: assignment.validUntil,
        });

        await this.tasks.markAccessCut(tx, locked.id, cut);
        if (cut.endOn !== null) {
          await this.ending.shorten(tx, actor, { organizationId, assignment, until: cut.endOn, taskId: locked.id });
        }

        return {
          action: 'ACCESS_CUT',
          after: {
            status: 'COMPLETED',
            taskKind: 'REVOKE',
            accessState: 'CUT',
            accessCutOn: cut.accessCutOn,
            validUntil: cut.endOn ?? assignment.validUntil,
            shortened: cut.endOn !== null,
          },
        };
      },
    });

    return (await this.views.views([task]))[0];
  }
}
