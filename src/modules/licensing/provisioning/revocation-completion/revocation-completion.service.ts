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
import { ProvisioningEvidenceFilesService } from '../evidence-files/provisioning-evidence-files.service';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { RevocationAftermath } from './revocation-aftermath.service';

type EvidenceCompletionInput = CompletionInput & { evidenceDocumentIds?: readonly string[] | undefined };

/**
 * What a person does to a revocation they work (`US-07-05` AC-1→AC-5, AC-8, AC-19): complete it, which is the only thing that
 * gives the seat back, and cut the access of a K1 seat earlier than the end of its paid period. Each is one transaction with its
 * audit events, under the locks of the task, the subscription, its line and the assignment in that order (the order of locks of the subscription
 * lines comes before the assignments, so a result of a renewal that writes the same line never waits for this in a circle). Nothing here writes savings,
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
    private readonly files: ProvisioningEvidenceFilesService,
  ) {}

  /**
   * Completes the revocation the IT Admin took, the way its kind of provisioning says, and ends the assignment. Throws
   * ProvisioningTaskNotFoundError, ProvisioningTaskStateError, ProvisioningTaskNotManualError,
   * ProvisioningTaskNotBeforeError, ProvisioningAnotherItAdminNeededError, RevocationCompletionError, ProvisioningEvidenceRequiredError, whatever the hook
   * throws and AssignmentNotOpenError.
   */
  async complete(actor: AuthenticatedPrincipal, id: string, input: EvidenceCompletionInput): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      beforeLock: null,
      check: (locked) => {
        assertRevocationTask(locked.kind);
        nextStatus(locked.status, 'COMPLETE', locked.channel);
      },
      write: async ({ tx, task: locked, organizationId, now }) => {
        const fileIds = await this.files.attach(
          tx,
          actor,
          locked.id,
          input.evidenceDocumentIds,
          'PROVISIONING_EVIDENCE',
        );
        const facts = toRevocationFacts(locked);
        const today = await this.organizationReads.businessToday(now, tx);
        // The day not before may have moved back to a later day when a reason with no grace was withdrawn: the work is not done before it.
        assertNotBefore(locked.notBefore, today);
        await this.revocation.emit(tx, { moment: 'BEFORE_WORK', task: facts, now });
        const plan = await this.aftermath.planOf(tx, locked.assignment.planId);
        await this.aftermath.lockLine(tx, locked);
        const assignment = await this.ending.lock(tx, locked.assignmentId);
        // A K1 completion stands on its checklist, which is kept now: the transaction ends with the completion or not at all (`QĐ-111az`).
        const checklist = await this.aftermath.keepChecklist(tx, locked, plan.provisioningType, input);
        const stated = checklist ? { ...input, evidence: checklist.evidence } : input;
        const done = planCompletion(stated, { type: plan.provisioningType, startsOn: assignment.effectiveFrom, today });
        // A K4 seat granted before the key pool holds no key: nothing is asked about one (Owner 12/11/2026).
        const holdsKey = plan.provisioningType === 'K4' && (await this.aftermath.holdsKey(tx, locked.assignmentId));
        const key = planKeyReturn(input, plan.provisioningType, holdsKey);
        await this.tasks.markRevocationCompleted(tx, locked.id, actor.appUserId, done, now);
        await this.ending.end(tx, actor, { organizationId, assignment, until: done.endOn, taskId: locked.id });
        // The listeners of the end of the work are told what the right held and when it ends, so the money held for it can be given back.
        const completed = await this.aftermath.completedOf(tx, locked, {
          provisioningType: plan.provisioningType,
          endedOn: done.endOn,
          paidThroughOn: done.paidThroughOn,
          personalCommitmentMonths: assignment.personalCommitmentMonths ?? null,
          billingAnchorOn: assignment.billingAnchorOn ?? null,
          k1Checklist: checklist?.facts ?? null,
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

        return completedRevocationAudit(done, actor.appUserId, key, followed, fileIds);
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
    input: { accessCutOn: BusinessDate; evidence: string; evidenceDocumentIds?: readonly string[] | undefined },
  ): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      beforeLock: null,
      check: (locked) => {
        assertRevocationTask(locked.kind);
        if (locked.status !== 'COMPLETED' || locked.accessState !== 'UNTIL_PAID_END') {
          throw new ProvisioningTaskStateError('NOT_TERMINATING');
        }
      },
      write: async ({ tx, task: locked, organizationId, now }) => {
        const fileIds = await this.files.attach(tx, actor, locked.id, input.evidenceDocumentIds, 'ACCESS_CUT_EVIDENCE');
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
            evidenceDocumentIds: fileIds,
          },
        };
      },
    });

    return (await this.views.views([task]))[0];
  }
}

function completedRevocationAudit(
  done: ReturnType<typeof planCompletion>,
  completedBy: string,
  key: ReturnType<typeof planKeyReturn>,
  followed: { licenseKeyId?: string | null },
  evidenceDocumentIds: string[],
) {
  return {
    action: 'REVOCATION_COMPLETED' as const,
    after: {
      status: 'COMPLETED',
      taskKind: 'REVOKE',
      completion: done.completion,
      accessState: done.accessState,
      paidThroughOn: done.paidThroughOn,
      validUntil: done.endOn,
      completedBy,
      evidenceDocumentIds,
      ...(key ? { licenseKeyId: followed.licenseKeyId, keyDisposition: key.disposition } : {}),
    },
  };
}
