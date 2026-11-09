import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { ProvisioningBeneficiaryDepartedError, ProvisioningTaskNotFoundError } from '../../public/licensing.errors';
import { GrantRequestGateHook, RevocationListeners } from '../../public/licensing.extension-points';
import type { ProvisioningChannel, ProvisioningTaskStatus } from '../../public/licensing.types';
import { cleanEvidence, cleanFailureReason, nextStatus } from '../provisioning.policy';
import { assertNotRevocationTask } from '../revocation.policy';
import { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { toRevocationFacts } from '../provisioning-task.types';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { ProvisioningTaskViewService, type TaskSummaryView, type TaskView } from '../provisioning-task-view.service';
import { SharedPoolService } from '../../shared-pool/shared-pool.service';
import { AssignmentService } from '../../assignment/assignment.service';

export type TaskScope = 'ALL' | 'MINE' | 'GENERAL';

/**
 * The queue of the work that makes a seat real (`US-07-01`, `US-07-02`): the list, one task, and the claim, the completion and the failure
 * of a task. The task is completed only with a note of evidence by a person, and is never completed, failed or changed by time. Every write
 * is one transaction with its audit event, under the lock of the task. The state of the request itself is the answer of the gate, not judged here.
 */
@Injectable()
export class ProvisioningService {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly views: ProvisioningTaskViewService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly gate: GrantRequestGateHook,
    private readonly revocation: RevocationListeners,
    private readonly sharedPool: SharedPoolService,
    private readonly assignments: AssignmentService,
  ) {}

  /** The queue, the oldest first: `MINE` the tasks this IT Admin is in charge of, `GENERAL` those nobody works by default. */
  async list(
    actor: AuthenticatedPrincipal,
    query: {
      channel?: ProvisioningChannel;
      status?: ProvisioningTaskStatus;
      scope: TaskScope;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<TaskSummaryView>> {
    const { items, total } = await this.repo.page({
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.scope === 'MINE' ? { responsibleEmployeeId: actor.employeeId } : {}),
      ...(query.scope === 'GENERAL' ? { generalQueueOf: await this.responsibleWhoLeft() } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.views.summaries(items), total, query.page, query.pageSize);
  }

  /** One task as a card. Throws ProvisioningTaskNotFoundError. */
  async get(id: string): Promise<TaskView> {
    const task = await this.repo.find(id);
    if (!task) throw new ProvisioningTaskNotFoundError();

    return (await this.views.views([task]))[0];
  }

  /**
   * Takes the task (or takes it over from another IT Admin). A revocation is taken whoever its beneficiary is, a person who
   * left included; the hook of the handover may refuse it. Throws ProvisioningTaskNotFoundError,
   * ProvisioningTaskNotManualError, ProvisioningTaskStateError, ProvisioningBeneficiaryDepartedError and
   * ProvisioningAnotherItAdminNeededError.
   */
  async claim(actor: AuthenticatedPrincipal, id: string): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      check: (locked) => nextStatus(locked.status, 'CLAIM', locked.channel),
      write: async ({ tx, task: locked, now }) => {
        if (locked.status === 'IN_PROGRESS' && locked.claimedByAppUserId === actor.appUserId) return false;
        if (locked.kind === 'REVOKE') {
          await this.revocation.emit(tx, { moment: 'BEFORE_WORK', task: toRevocationFacts(locked), now });
        } else {
          const beneficiary = await this.organizationReads.getEmployee(locked.assignment.employeeId, tx);
          if (beneficiary && beneficiary.status !== 'ACTIVE') {
            throw new ProvisioningBeneficiaryDepartedError(locked.requestId ?? '');
          }
        }
        await this.repo.markClaimed(tx, locked.id, actor.appUserId, now);
        if (locked.kind === 'REVOKE') {
          await this.revocation.emit(tx, {
            moment: 'AFTER_WORK',
            task: { ...toRevocationFacts(locked), status: 'IN_PROGRESS' },
            now,
            actor,
          });
        }

        return { action: 'CLAIMED', after: { status: 'IN_PROGRESS', claimedBy: actor.appUserId } };
      },
    });

    return (await this.views.views([task]))[0];
  }

  /**
   * Completes the task of a grant with the note of what was done; a revocation has its own completion. Throws
   * ProvisioningEvidenceRequiredError, the errors of `claim` except the departed beneficiary, and ProvisioningTaskStateError
   * (`IS_REVOCATION` for a revocation).
   * A grant taken from the pool, with nothing bought for it, records the cost it avoided once (`BR-MF1-09c`). The day it is completed is
   * the day the right begins (`BR-MF1-06a`).
   */
  async complete(actor: AuthenticatedPrincipal, id: string, input: { evidence: string }): Promise<TaskView> {
    const evidence = cleanEvidence(input.evidence);
    const task = await this.frame.work(actor, id, {
      check: (locked) => {
        assertNotRevocationTask(locked.kind);
        nextStatus(locked.status, 'COMPLETE', locked.channel);
      },
      write: async ({ tx, task: locked, now, organizationId }) => {
        await this.repo.markCompleted(tx, locked.id, actor.appUserId, evidence, now);
        const completedOn = await this.organizationReads.businessToday(now, tx);
        await this.assignments.recordGranted(tx, locked.assignmentId, completedOn);
        if (locked.requestId !== null) {
          const provisioningType = await this.sharedPool.provisioningTypeOf(tx, locked.assignment.planId);
          const pooled = provisioningType === 'K2' || provisioningType === 'K4';
          // From the pool means taken from a free seat or key: a K2 or K4 grant with nothing bought for it (`BR-MF1-09c`).
          const fromPool = pooled && locked.purchase === null;
          await this.gate.get().reportOutcome(tx, locked.requestId, 'COMPLETED', locked.assignment.employeeId, {
            fromPool,
            provisioningType,
            grantedOn: completedOn,
            assignmentId: locked.assignmentId,
          });
          if (fromPool) {
            await this.sharedPool.recordAvoided(tx, {
              organizationId,
              completedOn,
              task: {
                id: locked.id,
                assignmentId: locked.assignmentId,
                requestId: locked.requestId,
                planId: locked.assignment.planId,
                subscriptionId: locked.assignment.subscriptionId,
                provisioningType,
              },
            });
          }
        }

        return { action: 'COMPLETED', after: { status: 'COMPLETED', completedBy: actor.appUserId } };
      },
    });

    return (await this.views.views([task]))[0];
  }

  /** Records that the work could not be done: the task fails and the seat stays taken. Throws as `complete`. */
  async reportFailure(actor: AuthenticatedPrincipal, id: string, input: { reason: string }): Promise<TaskView> {
    const reason = cleanFailureReason(input.reason);
    const task = await this.frame.work(actor, id, {
      check: (locked) => nextStatus(locked.status, 'FAIL', locked.channel),
      write: async ({ tx, task: locked, now }) => {
        await this.repo.markFailed(tx, locked.id, actor.appUserId, reason, now);

        return { action: 'FAILED', after: { status: 'FAILED', failureKind: 'NOT_DONE', failureReason: reason } };
      },
    });

    return (await this.views.views([task]))[0];
  }

  /** The persons in charge by default who no longer work: the tasks of those join the general queue. */
  private async responsibleWhoLeft(): Promise<string[]> {
    const ids = await this.repo.responsibleEmployeeIds();
    const known = await this.organizationReads.getEmployees(ids);

    return known.filter((employee) => employee.status !== 'ACTIVE').map((employee) => employee.id);
  }
}
