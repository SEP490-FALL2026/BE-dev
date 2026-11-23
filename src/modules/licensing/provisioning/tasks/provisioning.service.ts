import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { ProvisioningTaskNotFoundError } from '../../public/licensing.errors';
import { RevocationListeners } from '../../public/licensing.extension-points';
import type { ProvisioningChannel, ProvisioningTaskStatus } from '../../public/licensing.types';
import type { K1ChecklistClaim } from '../k1-checklist/provisioning-k1-checklist.policy';
import { assertItAdmin, cleanEvidence, cleanFailureReason, nextStatus } from '../provisioning.policy';
import { assertNotBefore, assertNotRevocationTask } from '../revocation.policy';
import { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { toRevocationFacts } from '../provisioning-task.types';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { ProvisioningTaskViewService, type TaskSummaryView, type TaskView } from '../provisioning-task-view.service';
import { ProvisioningGrantCompletion } from './provisioning-grant-completion.service';
import { ProvisioningHolderService } from './provisioning-holder.service';

export type TaskScope = 'ALL' | 'MINE';

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
    private readonly identity: IdentityAccessApi,
    private readonly revocation: RevocationListeners,
    private readonly completion: ProvisioningGrantCompletion,
    private readonly holders: ProvisioningHolderService,
  ) {}

  /** The queue, the oldest first: `MINE` for departments the IT Admin acts for, `ALL` for the caller's read scope. */
  async list(
    actor: AuthenticatedPrincipal,
    query: {
      channel?: ProvisioningChannel;
      status?: ProvisioningTaskStatus;
      scope: TaskScope;
      claimableNow?: boolean;
      overdue?: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<TaskSummaryView>> {
    assertItAdmin(actor);
    const usable = (ids: readonly string[]) => this.identity.findUsableItAdminEmployeeIds(ids);
    const deptIds =
      query.scope === 'MINE'
        ? await this.organizationReads.getItAdminActingScope(actor.employeeId, usable)
        : await this.organizationReads.getItAdminScope(actor.employeeId, usable);
    if (deptIds.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const today = await this.organizationReads.businessToday();
    const beneficiaryEmployeeIds = await this.organizationReads.getEmployeeIdsOfWorkDepartments(deptIds, today);
    if (beneficiaryEmployeeIds.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { items, total } = await this.repo.page({
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      beneficiaryEmployeeIds,
      ...(query.claimableNow !== undefined ? { claimableOn: { today, claimable: query.claimableNow } } : {}),
      ...(query.overdue !== undefined ? { overdueOn: { today, overdue: query.overdue } } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.views.summaries(items), total, query.page, query.pageSize);
  }

  /** One task as a card, scoped to the caller's IT Admin read scope. Throws ProvisioningTaskNotFoundError. */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<TaskView> {
    assertItAdmin(actor);
    const task = await this.repo.find(id);
    if (!task) throw new ProvisioningTaskNotFoundError();

    const today = await this.organizationReads.businessToday();
    const deptId = (await this.organizationReads.workDepartmentsOf([task.assignment.employeeId], today)).get(
      task.assignment.employeeId,
    );
    if (!deptId) throw new ProvisioningTaskNotFoundError();

    const readScope = await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
    if (!readScope.includes(deptId)) throw new ProvisioningTaskNotFoundError();

    return (await this.views.views([task]))[0];
  }

  /**
   * Takes the task (or takes it over from another IT Admin, whoever its beneficiary is by then). A revocation is taken whoever its
   * beneficiary is, a person who left included; a task to grant is begun only for a beneficiary who works and whose access is not blocked
   * (`QĐ-77f`, `QĐ-110d`), and one already in progress is not judged again. A listener of the revocation may refuse it by throwing at `BEFORE_WORK` (none does today). Throws ProvisioningTaskNotFoundError,
   * ProvisioningTaskNotManualError, ProvisioningTaskStateError, ProvisioningBeneficiaryDepartedError and
   * ProvisioningAnotherItAdminNeededError.
   */
  async claim(actor: AuthenticatedPrincipal, id: string): Promise<TaskView> {
    const task = await this.frame.work(actor, id, {
      // The beneficiary of a grant not yet begun is held before the task is locked: a departure that blocks them holds the person first and then reaches the task.
      beforeLock: async (tx, probe) => {
        if (probe.kind === 'GRANT' && probe.status === 'QUEUED') {
          await this.holders.holdBeneficiaryOfTask(tx, probe.assignment.employeeId);
        }
      },
      check: (locked) => nextStatus(locked.status, 'CLAIM', locked.channel),
      write: async ({ tx, task: locked, now }) => {
        if (locked.status === 'IN_PROGRESS' && locked.claimedByAppUserId === actor.appUserId) return false;
        if (locked.kind === 'REVOKE') {
          // A revocation with a day not before is not taken before it (`US-10-07` AC-18): nothing changes and nobody is told.
          assertNotBefore(locked.notBefore, await this.organizationReads.businessToday(now, tx));
          await this.revocation.emit(tx, { moment: 'BEFORE_WORK', task: toRevocationFacts(locked), now });
        } else if (locked.status === 'QUEUED') {
          // Only a task not yet begun is held back: one already being worked may change hands, for the IT Admin to check with the vendor (`QĐ-110d`).
          await this.holders.requireCanBeginTask(tx, locked.requestId ?? '', locked.assignment.employeeId);
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
   * Completes the task of a grant with the note of what was done; a revocation has its own completion. A K4 grant names the free key of
   * the store its seat is given (`licenseKeyId`, `QĐ-103d`). Throws ProvisioningEvidenceRequiredError, the errors of `claim` except the
   * departed beneficiary, ProvisioningTaskStateError (`IS_REVOCATION` for a revocation), ProvisioningKeyError, LicenseKeyNotFoundError and
   * LicenseKeyStateError. A grant taken from the pool, with nothing bought for it, records the cost it avoided once (`BR-MF1-09c`). The day
   * it is completed is the day the right begins (`BR-MF1-06a`). The grant of a K1 seat is completed with the checklist of its two steps and the
   * evidence, which may be written in the checklist (`QĐ-111az`; ProvisioningK1ChecklistError): a body that sends one is not asked for the
   * evidence beside it here, the checklist judges it.
   */
  async complete(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { evidence: string; licenseKeyId?: string | undefined; k1Checklist?: K1ChecklistClaim | undefined },
  ): Promise<TaskView> {
    const evidence = input.k1Checklist === undefined ? cleanEvidence(input.evidence) : input.evidence.trim();
    const task = await this.frame.work(actor, id, {
      check: (locked) => {
        assertNotRevocationTask(locked.kind);
        nextStatus(locked.status, 'COMPLETE', locked.channel);
      },
      write: async ({ tx, task: locked, now, organizationId }) => {
        await this.completion.write(
          tx,
          actor,
          { task: locked, now, organizationId },
          { evidence, licenseKeyId: input.licenseKeyId, k1Checklist: input.k1Checklist },
        );
        const after = {
          status: 'COMPLETED',
          completedBy: actor.appUserId,
          ...(input.licenseKeyId === undefined ? {} : { licenseKeyId: input.licenseKeyId }),
        };

        return { action: 'COMPLETED', after };
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
}
