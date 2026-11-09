import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { AssignmentEndService } from '../../assignment/assignment-end.service';
import { AssignmentNotOpenError, ProvisioningTaskStateError } from '../../public/licensing.errors';
import { nextStatus } from '../provisioning.policy';
import { RevocationListeners } from '../../public/licensing.extension-points';
import {
  assertNotBefore,
  assertRevocationTask,
  planAccessCut,
  planCompletion,
  planKeyReturn,
  type CompletionInput,
} from '../revocation.policy';
import { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { toRevocationFacts } from '../provisioning-task.types';
import { ProvisioningTaskViewService, type TaskView } from '../provisioning-task-view.service';
import { RevocationCompletedFactsReader } from './revocation-completed-facts.service';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { RevocationAftermath } from './revocation-aftermath.service';

/**
 * What a person does to a revocation they work (`US-07-05` AC-1→AC-5, AC-8, AC-19): complete it, which is the only thing that
 * gives the seat back, and cut the access of a K1 seat earlier than the end of its paid period. Each is one transaction with its
 * audit events, under the locks of the task, the subscription and the assignment in that order. Nothing here writes savings,
 * an invoice, a contract or a budget (`AC-17`): the seat goes back, and what that saves is for another module to record. The key of a K4
 * seat goes back to the store, or back and withdrawn from it, after the assignment (`QĐ-103d`). A K1 seat
 * of a person who leaves whose access runs on to the end of the paid period is told to the IT Admin in charge in the same
 * transaction (`US-12-15` line 38, `QĐ-77l`).
 */
@Injectable()
export class RevocationCompletionService {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly views: ProvisioningTaskViewService,
    private readonly ending: AssignmentEndService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly revocation: RevocationListeners,
    private readonly aftermath: RevocationAftermath,
    private readonly completedFacts: RevocationCompletedFactsReader,
  ) {}

  /**
   * Completes the revocation the IT Admin took, the way its kind of provisioning says, and ends the assignment. Throws
   * ProvisioningTaskNotFoundError, ProvisioningTaskStateError, ProvisioningTaskNotManualError,
   * ProvisioningTaskNotBeforeError, ProvisioningAnotherItAdminNeededError, RevocationCompletionError, ProvisioningEvidenceRequiredError, whatever the hook
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
        const today = await this.organizationReads.businessToday(now, tx);
        // The day not before may have moved back to a later day when a reason with no grace was withdrawn: the work is not done before it.
        assertNotBefore(locked.notBefore, today);
        await this.revocation.emit(tx, { moment: 'BEFORE_WORK', task: facts, now });
        const plan = await this.completedFacts.planOf(tx, locked.assignment.planId);
        const assignment = await this.ending.lock(tx, locked.assignmentId);
        const done = planCompletion(input, { type: plan.provisioningType, startsOn: assignment.effectiveFrom, today });
        const key = planKeyReturn(input, plan.provisioningType);

        await this.tasks.markRevocationCompleted(tx, locked.id, actor.appUserId, done, now);
        await this.ending.end(tx, actor, { organizationId, assignment, until: done.endOn, taskId: locked.id });
        // The listeners of the end of the work are told what the right held and when it ends, so the money held for it can be given back.
        const completed = await this.completedFacts.completedOf(tx, locked, {
          provisioningType: plan.provisioningType,
          endedOn: done.endOn,
          paidThroughOn: done.paidThroughOn,
        });
        await this.revocation.emit(tx, {
          moment: 'AFTER_WORK',
          task: { ...facts, status: 'COMPLETED', completed },
          now,
          actor,
        });
        const followed = await this.aftermath.follow(tx, actor, {
          organizationId,
          task: locked,
          key,
          accessState: done.accessState,
          accessUntil: done.paidThroughOn ?? done.endOn,
          today,
          now,
        });

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
            // A K4 seat: the key that went back to the store (null when the seat held none), and whether it was withdrawn.
            ...(key ? { licenseKeyId: followed.licenseKeyId, keyDisposition: key.disposition } : {}),
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
        const today = await this.organizationReads.businessToday(now, tx);
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
