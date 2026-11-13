import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatTarget } from '../../catalog/public/catalog.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
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
} from '../public/licensing.types';
import { availableDecisions } from './failure.policy';
import { doneWhenFor, inGeneralQueue, stepsFor } from './provisioning.policy';
import type { K1ChecklistCard } from './k1-checklist/provisioning-k1-checklist.policy';
import { ProvisioningK1Checklist } from './k1-checklist/provisioning-k1-checklist.service';
import { isTerminating } from './revocation.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.types';
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
  /** The reasons taken back (`BR-MF5-04`): how many, and when the last was; a withdrawn reason is read nowhere else. */
  withdrawnReasonCount: number;
  lastWithdrawnAt: Date | null;
}

/** The card of a task as the IT Admin reads it: the row of the list and the rest a detail adds. */
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
    /** What the plan says to do before the seat is taken away, on a revocation; null on a grant and when the plan has none. */
    preRevocationNote: string | null;
  } | null;
  subscriptionId: string | null;
  accountIdentifier: string;
  defaultResponsibleEmployeeId: string | null;
  inGeneralQueue: boolean;
  /** What the reasons that stand ask of a revocation: not before a day (`notBefore`), due by a day; null for a grant and when none asked. */
  dueOn: BusinessDate | null;
  notBefore: BusinessDate | null;
  /** False only while a revocation is in its grace: it may not be taken or completed before `notBefore`. */
  claimableNow: boolean;
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
  /** What was bought with the grant when the pool had nothing free; null when the seat came from the pool (`BR-MF1-09b`). */
  purchase: ProvisioningTaskRecord['purchase'];
  /** Seconds from the making of the task to its end, or to now while it is open: the same measure on both channels. */
  elapsedSeconds: number;
}

/** What only a detail carries: the steps, the evidence, the errors and who did what. */
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
  /** The checklist of a K1 revocation: the steps to tick while it can be completed, what was ticked once it is (`QĐ-111az`); null on any other task. */
  k1Checklist: K1ChecklistCard | null;
}

export type TaskView = Omit<TaskSummaryView, 'revocation'> & TaskDetailFields;

interface ViewContext {
  employees: Map<string, { id: string; employeeCode: string; fullName: string; status: string }>;
  plans: Map<string, SeatTarget>;
  /** The note of each plan of a revocation about what to do before the seat is taken away (`QĐ-110g`: read only, nobody confirms it). */
  notes: Map<string, string | null>;
  /** The reasons of the revocations among the tasks: all of them for a detail, only how many for a row of the list. */
  reasons: Map<string, ReasonRecord[]>;
  reasonCounts: Map<string, number>;
  today: BusinessDate;
  now: number;
}

/** The plan on a card: its names and kind of provisioning, and, on a revocation, what the plan says to do before the seat goes. */
function planCardOf(plan: SeatTarget | undefined, note: string | null | undefined): TaskSummaryView['plan'] {
  return plan
    ? {
        planId: plan.planId,
        planName: plan.planName,
        applicationId: plan.applicationId,
        applicationName: plan.applicationName,
        provisioningType: plan.provisioningType,
        preRevocationNote: note ?? null,
      }
    : null;
}

/**
 * Builds the cards of tasks: the people, the plan and its kind of provisioning, the steps that kind asks for, what the
 * IT Admin may decide, and how long the task has taken. Everything is read through the facades of the modules that own it,
 * the people and the plans of a whole page in one read each.
 */
@Injectable()
export class ProvisioningTaskViewService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly reasons: ProvisioningTaskReasonRepo,
    private readonly checklists: ProvisioningK1Checklist,
  ) {}

  /** The rows of a list: no steps, evidence or errors. */
  async summaries(records: readonly ProvisioningTaskRecord[]): Promise<TaskSummaryView[]> {
    const context = await this.contextOf(records, false);

    return records.map((task) => this.summaryOf(task, context));
  }

  /** The cards with everything a detail shows. */
  async views(records: readonly ProvisioningTaskRecord[]): Promise<TaskView[]> {
    const context = await this.contextOf(records, true);
    const checklists = await this.checklists.cardsOf(
      records
        .filter(
          (task) => task.kind === 'REVOKE' && context.plans.get(task.assignment.planId)?.provisioningType === 'K1',
        )
        .map((task) => ({
          id: task.id,
          status: task.status,
          employeeId: task.assignment.employeeId,
          revocationSource: task.revocationSource,
          reasons: (context.reasons.get(task.id) ?? []).filter((reason) => reason.withdrawnAt === null),
        })),
    );

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
        k1Checklist: checklists.get(task.id) ?? null,
      };
    });
  }

  private detailOf(
    task: ProvisioningTaskRecord,
    summary: RevocationSummaryView,
    reasons: readonly ReasonRecord[],
  ): RevocationDetailView {
    const standing = reasons.filter((reason) => reason.withdrawnAt === null);
    const first = standing.find((reason) => reason.source === task.revocationSource) ?? standing[0];

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
      withdrawnReasonCount: reasons.filter((reason) => reason.withdrawnAt !== null).length,
      lastWithdrawnAt:
        reasons
          .flatMap((reason) => reason.withdrawnAt ?? [])
          .sort((x, y) => y.getTime() - x.getTime())
          .at(0) ?? null,
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
      (await this.organizationReads.getEmployees(employeeIds)).map((employee) => [employee.id, employee]),
    );
    const planIds = [...new Set(records.map((task) => task.assignment.planId))];
    const plans = new Map((await this.catalog.findPlanSeatTargets(planIds)).map((plan) => [plan.planId, plan]));
    const revocations = records.filter((task) => task.kind === 'REVOKE');
    const revocationIds = revocations.map((task) => task.id);
    const noted = [...new Set(revocations.map((task) => task.assignment.planId))];
    const notes = new Map(
      (noted.length > 0 ? await this.catalog.getPlanRevocationInfo(noted) : []).map((info) => [
        info.planId,
        info.revocationNote,
      ]),
    );
    const reasons = new Map<string, ReasonRecord[]>();
    if (withReasons) {
      for (const reason of await this.reasons.listAllOf(revocationIds)) {
        reasons.set(reason.taskId, [...(reasons.get(reason.taskId) ?? []), reason]);
      }
    }
    const reasonCounts = withReasons
      ? new Map(
          [...reasons].map(([taskId, list]) => [taskId, list.filter((reason) => reason.withdrawnAt === null).length]),
        )
      : await this.reasons.countOf(revocationIds);
    const today = revocationIds.length > 0 ? await this.organizationReads.businessToday() : '';

    return { employees, plans, notes, reasons, reasonCounts, today, now: Date.now() };
  }

  private summaryOf(
    task: ProvisioningTaskRecord,
    { employees, plans, notes, reasonCounts, today, now }: ViewContext,
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
      plan: planCardOf(plan, task.kind === 'REVOKE' ? notes.get(task.assignment.planId) : undefined),
      subscriptionId: task.assignment.subscriptionId,
      accountIdentifier: task.assignment.accountIdentifier,
      defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
      inGeneralQueue: inGeneralQueue({
        defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
        responsibleStillWorks: responsible?.status === 'ACTIVE',
      }),
      dueOn: task.dueOn,
      notBefore: task.notBefore,
      claimableNow: task.notBefore === null || task.notBefore <= today,
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
      purchase: task.purchase,
      elapsedSeconds: Math.max(0, Math.floor(((ended ? ended.getTime() : now) - task.createdAt.getTime()) / 1000)),
    };
  }
}
