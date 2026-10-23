import { Injectable } from '@nestjs/common';
import { CatalogService } from '../../catalog/catalog.service';
import type { SeatTarget } from '../../catalog/catalog.types';
import { OrganizationService } from '../../organization/organization.service';
import type {
  ProvisioningChannel,
  ProvisioningDecision,
  ProvisioningFailureKind,
  ProvisioningKind,
  ProvisioningTaskKind,
  ProvisioningTaskStatus,
  TaskDoneWhen,
  TaskStep,
} from '../licensing.types';
import { availableDecisions } from './failure.policy';
import { doneWhenFor, inGeneralQueue, stepsFor } from './provisioning.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.repo';

/** The card of a task as the IT Admin reads it: the row of the list and the rest a detail adds (`LD-08`). */
export interface TaskSummaryView {
  id: string;
  kind: ProvisioningTaskKind;
  channel: ProvisioningChannel;
  status: ProvisioningTaskStatus;
  requestId: string;
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
}

export type TaskView = TaskSummaryView & TaskDetailFields;

interface ViewContext {
  employees: Map<string, { id: string; employeeCode: string; fullName: string; status: string }>;
  plans: Map<string, SeatTarget>;
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
  ) {}

  /** The rows of a list: no steps, evidence or errors. */
  async summaries(records: readonly ProvisioningTaskRecord[]): Promise<TaskSummaryView[]> {
    const context = await this.contextOf(records);

    return records.map((task) => this.summaryOf(task, context));
  }

  /** The cards with everything a detail shows. */
  async views(records: readonly ProvisioningTaskRecord[]): Promise<TaskView[]> {
    const context = await this.contextOf(records);

    return records.map((task) => {
      const plan = context.plans.get(task.assignment.planId);

      return {
        ...this.summaryOf(task, context),
        steps: plan ? stepsFor(plan.provisioningType, task.assignment.accountIdentifier) : [],
        doneWhen: plan ? doneWhenFor(plan.provisioningType) : null,
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
      };
    });
  }

  private async contextOf(records: readonly ProvisioningTaskRecord[]): Promise<ViewContext> {
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

    return { employees, plans, now: Date.now() };
  }

  private summaryOf(task: ProvisioningTaskRecord, { employees, plans, now }: ViewContext): TaskSummaryView {
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
      elapsedSeconds: Math.max(0, Math.floor(((ended ? ended.getTime() : now) - task.createdAt.getTime()) / 1000)),
    };
  }
}
