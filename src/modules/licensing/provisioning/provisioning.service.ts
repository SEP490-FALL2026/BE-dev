import { Inject, Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/catalog.service';
import type { SeatTarget } from '../../catalog/catalog.types';
import { OrganizationService } from '../../organization/organization.service';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { AssignmentService } from '../assignment/assignment.service';
import {
  GrantRequestRefusedError,
  ProvisioningBeneficiaryDepartedError,
  ProvisioningResponsibleInvalidError,
  ProvisioningSubscriptionError,
  ProvisioningTaskNotFoundError,
  SeatQuantityUnknownError,
  SeatTargetNotFoundError,
} from '../licensing.errors';
import {
  GRANT_REQUEST_GATE,
  type GrantRequestGate,
  type ProvisioningChannel,
  type ProvisioningTaskStatus,
} from '../licensing.types';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import {
  assertGrantableType,
  assertSubscriptionChoice,
  chooseServiceIdentifier,
  cleanEvidence,
  cleanFailureReason,
  nextStatus,
} from './provisioning.policy';
import { maxAttempts as maxAttemptsFor } from './failure.policy';
import { RegisteredRevocationHook } from './registered-revocation-hook.service';
import { assertNotRevocationTask } from './revocation.policy';
import { ProvisioningHolderService } from './provisioning-holder.service';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { toRevocationFacts } from './provisioning-task.record';
import { ProvisioningTaskRepo } from './provisioning-task.repo';
import { ProvisioningTaskViewService, type TaskSummaryView, type TaskView } from './provisioning-task-view.service';

export type TaskScope = 'ALL' | 'MINE' | 'GENERAL';

/**
 * The queue of the work that makes a seat real (`US-07-01`, `US-07-02`). A grant writes the assignment, which holds the
 * seat from that day, and a task for a person to do; the task is completed only with a note of evidence by a person, and
 * is never completed, failed or changed by time. Every write is one transaction with its audit event, under the lock of
 * the seat target or of the task. The state of the request itself is the answer of the gate, not judged here.
 */
@Injectable()
export class ProvisioningService {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly holders: ProvisioningHolderService,
    private readonly views: ProvisioningTaskViewService,
    private readonly assignments: AssignmentService,
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly parameters: OperatingParametersService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
    @Inject(GRANT_REQUEST_GATE) private readonly gate: GrantRequestGate,
    private readonly revocationHook: RegisteredRevocationHook,
  ) {}

  /**
   * Grants the seat of a request: the assignment (source REQUEST, from today) and a manual task in the queue of the IT
   * Admin in charge of the department of whoever holds it. A personal seat is the beneficiary's, under a company account; a
   * service account (`US-05-21`) is answered for by a person of the department that owns it, under the identifier the IT
   * Admin enters. Throws GrantRequestRefusedError, SeatTargetNotFoundError, ProvisioningTypeNotSupportedError,
   * ProvisioningSubscriptionError, SeatQuantityUnknownError, EmployeeNotFoundError, ProvisioningBeneficiaryDepartedError,
   * ProvisioningBeneficiaryNotStartedError, ProvisioningPersonalAccountError, ProvisioningAccountIdentifierRequiredError,
   * ProvisioningResponsibleNotInDepartmentError, ProvisioningResponsibleInvalidError, ProvisioningAnotherItAdminNeededError
   * and AssignmentConflictError.
   */
  async grant(
    actor: AuthenticatedPrincipal,
    input: {
      requestId: string;
      subscriptionId?: string;
      accountIdentifier?: string;
      expectedEndDate?: BusinessDate;
      responsibleEmployeeId?: string;
      /** The person of a request for a group this grant is for; a request for one person has none to name. */
      beneficiaryEmployeeId?: string;
    },
  ): Promise<{ task: TaskView; warnings: 'DEPARTMENT_WITHOUT_IT_ADMIN'[] }> {
    const answer = await this.gate.check(input.requestId, input.beneficiaryEmployeeId);
    if (answer.status !== 'GRANTABLE') throw new GrantRequestRefusedError(answer.status);
    // Only a service account has a person to name, and its identifier is the IT Admin's to give: nothing is locked or written yet.
    if (answer.seat === 'PERSONAL' && input.responsibleEmployeeId !== undefined) {
      throw new ProvisioningResponsibleInvalidError('NOT_SERVICE_ACCOUNT');
    }
    const serviceIdentifier = answer.seat === 'SERVICE' ? chooseServiceIdentifier(input.accountIdentifier) : null;

    const plan = await this.catalog.findSeatTarget({ planId: answer.planId });
    if (!plan) throw new SeatTargetNotFoundError('PLAN');
    assertGrantableType(plan.provisioningType);
    assertSubscriptionChoice(plan.provisioningType, input.subscriptionId);

    const organization = await this.requireOrganization();
    const today = await this.organization.businessToday();
    const inCharge = await this.organization.getItAdminInCharge(
      input.responsibleEmployeeId ?? answer.employeeId,
      today,
    );
    // The most tries are fixed here: a parameter changed later reaches only the tasks made after it (US-01-04 AC-13).
    const maxAttempts = maxAttemptsFor(Number(await this.parameters.getValue('PROVISIONING_RETRY_COUNT')));

    const record = await this.runner.run(async (tx) => {
      // The request is locked and moved to "being carried out" here, in the transaction of the grant: a second grant of
      // the same request finds it no longer grantable, and a request that changed since the read above is refused.
      const claimed = await this.gate.claimForGrant(tx, input.requestId, input.beneficiaryEmployeeId);
      if (claimed.status !== 'GRANTABLE') throw new GrantRequestRefusedError(claimed.status);
      if (
        claimed.employeeId !== answer.employeeId ||
        claimed.planId !== answer.planId ||
        claimed.seat !== answer.seat
      ) {
        throw new GrantRequestRefusedError('NOT_APPROVED');
      }
      const target = await this.lockTarget(tx, plan, input.subscriptionId);
      const holder =
        claimed.seat === 'SERVICE' && serviceIdentifier !== null
          ? await this.holders.service(tx, actor, {
              requested: { employeeId: claimed.employeeId, account: claimed.serviceAccount },
              named: input.responsibleEmployeeId,
              accountIdentifier: serviceIdentifier,
              today,
            })
          : await this.holders.personal(tx, {
              requestId: input.requestId,
              employeeId: answer.employeeId,
              accountIdentifier: input.accountIdentifier,
              today,
            });

      const assignment = await this.assignments.createFromRequest(tx, actor, {
        organizationId: organization.id,
        requestId: input.requestId,
        target,
        holder,
        effectiveFrom: today,
        // The day the head gave for a person who is not staff is the end of the seat unless the IT Admin names another.
        expectedEndDate: input.expectedEndDate ?? claimed.expectedEndDate,
      });
      const task = await this.repo.insert(tx, {
        organizationId: organization.id,
        assignmentId: assignment.id,
        channel: 'MANUAL',
        requestId: input.requestId,
        defaultResponsibleEmployeeId: inCharge?.itAdminEmployeeId ?? null,
        createdByAppUserId: actor.appUserId,
        maxAttempts,
      });
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, organization.id, 'PROVISIONING_TASK.CREATED', 'ProvisioningTask', task.id, null, {
          requestId: input.requestId,
          assignmentId: assignment.id,
          channel: task.channel,
          defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
          ...(holder.selfExecuted === null ? {} : { selfExecuted: holder.selfExecuted }),
        }),
      );

      return task;
    });

    return {
      task: (await this.views.views([record]))[0],
      warnings: inCharge && inCharge.itAdminEmployeeId === null ? ['DEPARTMENT_WITHOUT_IT_ADMIN'] : [],
    };
  }

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
          await this.revocationHook.beforeWork(tx, toRevocationFacts(locked), now);
        } else {
          const beneficiary = await this.organization.getEmployee(locked.assignment.employeeId, tx);
          if (beneficiary && beneficiary.status !== 'ACTIVE') {
            throw new ProvisioningBeneficiaryDepartedError(locked.requestId ?? '');
          }
        }
        await this.repo.markClaimed(tx, locked.id, actor.appUserId, now);
        if (locked.kind === 'REVOKE') {
          await this.revocationHook.afterWork(tx, { ...toRevocationFacts(locked), status: 'IN_PROGRESS' }, now, actor);
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
   */
  async complete(actor: AuthenticatedPrincipal, id: string, input: { evidence: string }): Promise<TaskView> {
    const evidence = cleanEvidence(input.evidence);
    const task = await this.frame.work(actor, id, {
      check: (locked) => {
        assertNotRevocationTask(locked.kind);
        nextStatus(locked.status, 'COMPLETE', locked.channel);
      },
      write: async ({ tx, task: locked, now }) => {
        await this.repo.markCompleted(tx, locked.id, actor.appUserId, evidence, now);
        if (locked.requestId !== null) {
          await this.gate.reportOutcome(tx, locked.requestId, 'COMPLETED', locked.assignment.employeeId);
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

  /** K5: the plan itself (no seat); K1 and K2: the subscription, which must be of the plan and have a quantity. */
  private async lockTarget(tx: DbTx, plan: SeatTarget, subscriptionId: string | undefined): Promise<SeatTarget> {
    const target = await this.catalog.lockSeatTarget(tx, subscriptionId ? { subscriptionId } : { planId: plan.planId });
    if (!target) throw new SeatTargetNotFoundError(subscriptionId ? 'SUBSCRIPTION' : 'PLAN');
    if (target.planId !== plan.planId) throw new ProvisioningSubscriptionError('PLAN_MISMATCH');
    this.assignments.assertSeatTargetUsable(target);
    if (target.kind === 'SUBSCRIPTION' && target.purchasedQuantity === null) throw new SeatQuantityUnknownError();

    return target;
  }

  /** The persons in charge by default who no longer work: the tasks of those join the general queue. */
  private async responsibleWhoLeft(): Promise<string[]> {
    const ids = await this.repo.responsibleEmployeeIds();
    const known = await this.organization.getEmployees(ids);

    return known.filter((employee) => employee.status !== 'ACTIVE').map((employee) => employee.id);
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A provisioning task was made before installation');

    return organization;
  }
}
