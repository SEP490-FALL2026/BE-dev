import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { CatalogService } from '../../catalog/catalog.service';
import type { SeatTarget } from '../../catalog/catalog.types';
import { OrganizationService } from '../../organization/organization.service';
import type {
  AccessState,
  ProvisioningChannel,
  ProvisioningDecision,
  ProvisioningFailureKind,
  ProvisioningKind,
  ProvisioningTaskKind,
  ProvisioningTaskStatus,
  RevocationCompletion,
  RevocationSource,
  TaskDoneWhen,
  TaskStep,
} from '../licensing.types';
import { availableDecisions } from './failure.policy';
import { doneWhenFor, inGeneralQueue, stepsFor } from './provisioning.policy';
import { isTerminating } from './revocation.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.record';
import { ProvisioningTaskReasonRepo, type ReasonRecord } from './provisioning-task-reason.repo';

/** What a row of the list says of a revocation: why it was opened, how it ended and whether the access still runs on. */
export interface RevocationSummaryView {
  /** The reason that opened the task; the others that asked for the same seat are counted in `reasonCount`. */
  source: RevocationSource;
  reasonCount: number;
  completion: RevocationCompletion | null;
  accessState: AccessState | null;
  paidThroughOn: BusinessDate | null;
  /** True while the renewal is cancelled and the access runs to the end of the paid period: read, never stored. */
  terminating: boolean;
  terminatingUntil: BusinessDate | null;
}

/** What only a detail says of a revocation: the notes, the cut of the access and who decided the first reason. */
export interface RevocationDetailView extends RevocationSummaryView {
  completionNote: string | null;
  accessCutOn: BusinessDate | null;
  accessEvidence: string | null;
  firstReason: {
    decidedByEmployeeId: string | null;
    decidedRole: string;
    referenceKind: string | null;
    referenceId: string | null;
    note: string | null;
    decidedAt: Date;
  } | null;
}

/** The card of a task as the IT Admin reads it: the row of the list and the rest a detail adds (`LD-08`). */
export interface TaskSummaryView {
  id: string;
  kind: ProvisioningTaskKind;
  channel: ProvisioningChannel;
  status: ProvisioningTaskStatus;
  /** The request a grant answers for; null for a revocation. */
  requestId: string | null;
  assignmentId: string;
  beneficiary: { employeeId: string; employeeCode: string; fullName: string } | null;
  plan: {
    planId: string;
    planName: string;
    applicationId: string;
    applicationName: string;
    provisioningType: ProvisioningKind;
  } | null;
  subscriptionId: string | null;
  accountIdentifier: string;
  defaultResponsibleEmployeeId: string | null;
  inGeneralQueue: boolean;
  createdAt: Date;
  claimedBy: string | null;
  claimedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureKind: ProvisioningFailureKind | null;
  /** The tries made, over `maxAttempts`: the first and the retries the configuration allows. */
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  availableDecisions: ProvisioningDecision[];
  closedAt: Date | null;
  /** Present on a revocation only. */
  revocation: RevocationSummaryView | null;
  /** Seconds from the making of the task to its end, or to now while it is open: the same measure on both channels. */
  elapsedSeconds: number;
}

/** What only a detail carries: the steps, the evidence, the errors and who did what (`LD-08`). */
export interface TaskDetailFields {
  steps: TaskStep[];
  doneWhen: TaskDoneWhen | null;
  completedBy: string | null;
  evidence: string | null;
  failedBy: string | null;
  failureReason: string | null;
  /** Technical detail of the last error, for the IT team only; never part of anything sent to the requester. */
  lastError: string | null;
  handedOffBy: string | null;
  handedOffAt: Date | null;
  handOffEvidence: string | null;
  closedBy: string | null;
  closeReason: string | null;
  revocation: RevocationDetailView | null;
}

export type TaskView = Omit<TaskSummaryView, 'revocation'> & TaskDetailFields;

interface ViewContext {
  employees: Map<string, { id: string; employeeCode: string; fullName: string; status: string }>;
  plans: Map<string, SeatTarget>;
  /** The reasons of the revocations among the tasks: all of them for a detail, only how many for a row of the list. */
  reasons: Map<string, ReasonRecord[]>;
  reasonCounts: Map<string, number>;
  today: BusinessDate;
  now: number;
}

/**
 * Builds the cards of tasks: the people, the plan and its kind of provisioning, the steps that kind asks for, what the
 * IT Admin may decide, and how long the task has taken. Everything is read through the facades of the modules that own it,
 * the people and the plans of a whole page in one read each (`LD-08`).
 */
@Injectable()
export class ProvisioningTaskViewService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly reasons: ProvisioningTaskReasonRepo,
  ) {}

  /** The rows of a list: no steps, evidence or errors. */
  async summaries(records: readonly ProvisioningTaskRecord[]): Promise<TaskSummaryView[]> {
    const context = await this.contextOf(records, false);

    return records.map((task) => this.summaryOf(task, context));
  }

  /** The cards with everything a detail shows. */
  async views(records: readonly ProvisioningTaskRecord[]): Promise<TaskView[]> {
    const context = await this.contextOf(records, true);

    return records.map((task) => {
      const plan = context.plans.get(task.assignment.planId);
      const { revocation: summary, ...rest } = this.summaryOf(task, context);

      return {
        ...rest,
        steps: plan ? stepsFor(plan.provisioningType, task.assignment.accountIdentifier, task.kind) : [],
        doneWhen: plan ? doneWhenFor(plan.provisioningType, task.kind) : null,
        completedBy: task.completedByAppUserId,
        evidence: task.evidence,
        failedBy: task.failedByAppUserId,
        failureReason: task.failureReason,
        lastError: task.lastError,
        handedOffBy: task.handedOffByAppUserId,
        handedOffAt: task.handedOffAt,
        handOffEvidence: task.handOffEvidence,
        closedBy: task.closedByAppUserId,
        closeReason: task.closeReason,
        revocation: summary ? this.detailOf(task, summary, context.reasons.get(task.id) ?? []) : null,
      };
    });
  }

  private detailOf(
    task: ProvisioningTaskRecord,
    summary: RevocationSummaryView,
    reasons: readonly ReasonRecord[],
  ): RevocationDetailView {
    const first = reasons.find((reason) => reason.source === task.revocationSource) ?? reasons[0];

    return {
      ...summary,
      completionNote: task.completionNote,
      accessCutOn: task.accessCutOn,
      accessEvidence: task.accessEvidence,
      firstReason: first
        ? {
            decidedByEmployeeId: first.decidedByEmployeeId,
            decidedRole: first.decidedRole,
            referenceKind: first.referenceKind,
            referenceId: first.referenceId,
            note: first.note,
            decidedAt: first.createdAt,
          }
        : null,
    };
  }

  private async contextOf(records: readonly ProvisioningTaskRecord[], withReasons: boolean): Promise<ViewContext> {
    const employeeIds = [
      ...new Set(
        records.flatMap((task) => [
          task.assignment.employeeId,
          ...(task.defaultResponsibleEmployeeId ? [task.defaultResponsibleEmployeeId] : []),
        ]),
      ),
    ];
    const employees = new Map(
      (await this.organization.getEmployees(employeeIds)).map((employee) => [employee.id, employee]),
    );
    const planIds = [...new Set(records.map((task) => task.assignment.planId))];
    const plans = new Map((await this.catalog.findPlanSeatTargets(planIds)).map((plan) => [plan.planId, plan]));
    const revocationIds = records.filter((task) => task.kind === 'REVOKE').map((task) => task.id);
    const reasons = new Map<string, ReasonRecord[]>();
    if (withReasons) {
      for (const reason of await this.reasons.listOf(revocationIds)) {
        reasons.set(reason.taskId, [...(reasons.get(reason.taskId) ?? []), reason]);
      }
    }
    const reasonCounts = withReasons
      ? new Map([...reasons].map(([taskId, list]) => [taskId, list.length]))
      : await this.reasons.countOf(revocationIds);
    const today = revocationIds.length > 0 ? await this.organization.businessToday() : '';

    return { employees, plans, reasons, reasonCounts, today, now: Date.now() };
  }

  private summaryOf(
    task: ProvisioningTaskRecord,
    { employees, plans, reasonCounts, today, now }: ViewContext,
  ): TaskSummaryView {
    const beneficiary = employees.get(task.assignment.employeeId);
    const plan = plans.get(task.assignment.planId);
    const responsible = task.defaultResponsibleEmployeeId
      ? employees.get(task.defaultResponsibleEmployeeId)
      : undefined;
    const ended = task.completedAt ?? task.closedAt ?? task.failedAt;

    return {
      id: task.id,
      kind: task.kind,
      channel: task.channel,
      status: task.status,
      requestId: task.requestId,
      assignmentId: task.assignmentId,
      beneficiary: beneficiary
        ? { employeeId: beneficiary.id, employeeCode: beneficiary.employeeCode, fullName: beneficiary.fullName }
        : null,
      plan: plan
        ? {
            planId: plan.planId,
            planName: plan.planName,
            applicationId: plan.applicationId,
            applicationName: plan.applicationName,
            provisioningType: plan.provisioningType,
          }
        : null,
      subscriptionId: task.assignment.subscriptionId,
      accountIdentifier: task.assignment.accountIdentifier,
      defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
      inGeneralQueue: inGeneralQueue({
        defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
        responsibleStillWorks: responsible?.status === 'ACTIVE',
      }),
      createdAt: task.createdAt,
      claimedBy: task.claimedByAppUserId,
      claimedAt: task.claimedAt,
      completedAt: task.completedAt,
      failedAt: task.failedAt,
      failureKind: task.failureKind,
      attempts: task.attempts,
      maxAttempts: task.maxAttempts,
      nextRetryAt: task.nextRetryAt,
      availableDecisions: availableDecisions(task.status, task.channel),
      closedAt: task.closedAt,
      revocation: task.revocationSource
        ? {
            source: task.revocationSource,
            reasonCount: reasonCounts.get(task.id) ?? 0,
            completion: task.completion,
            accessState: task.accessState,
            paidThroughOn: task.paidThroughOn,
            terminating: isTerminating(task, task.assignment.validUntil, today),
            terminatingUntil: isTerminating(task, task.assignment.validUntil, today)
              ? task.assignment.validUntil
              : null,
          }
        : null,
      elapsedSeconds: Math.max(0, Math.floor(((ended ? ended.getTime() : now) - task.createdAt.getTime()) / 1000)),
    };
  }
}
