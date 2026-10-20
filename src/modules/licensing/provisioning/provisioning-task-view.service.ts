import { Injectable } from '@nestjs/common';
import { CatalogService } from '../../catalog/catalog.service';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
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
import { availableDecisions, maxAttempts } from './failure.policy';
import { doneWhenFor, inGeneralQueue, stepsFor } from './provisioning.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.repo';

/** The card of a task as the IT Admin reads it. */
export interface TaskView {
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
  steps: TaskStep[];
  doneWhen: TaskDoneWhen | null;
  defaultResponsibleEmployeeId: string | null;
  inGeneralQueue: boolean;
  createdAt: Date;
  claimedBy: string | null;
  claimedAt: Date | null;
  completedBy: string | null;
  completedAt: Date | null;
  evidence: string | null;
  failedBy: string | null;
  failedAt: Date | null;
  failureReason: string | null;
  failureKind: ProvisioningFailureKind | null;
  /** The tries made, over `maxAttempts`: the first and the retries the configuration allows. */
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  /** Technical detail of the last error, for the IT team only; never part of anything sent to the requester. */
  lastError: string | null;
  availableDecisions: ProvisioningDecision[];
  handedOffBy: string | null;
  handedOffAt: Date | null;
  handOffEvidence: string | null;
  closedBy: string | null;
  closedAt: Date | null;
  closeReason: string | null;
  /** Seconds from the making of the task to its end, or to now while it is open: the same measure on both channels. */
  elapsedSeconds: number;
}

/**
 * Builds the cards of tasks: the people, the plan and its kind of provisioning, the steps that kind asks for, what the
 * IT Admin may decide, and how long the task has taken. Everything is read through the facades of the modules that own it.
 */
@Injectable()
export class ProvisioningTaskViewService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly parameters: OperatingParametersService,
  ) {}

  async views(records: readonly ProvisioningTaskRecord[]): Promise<TaskView[]> {
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
    const plans = new Map(
      (await Promise.all(planIds.map((planId) => this.catalog.findSeatTarget({ planId })))).flatMap((plan) =>
        plan ? [[plan.planId, plan] as const] : [],
      ),
    );
    const limit = maxAttempts(Number(await this.parameters.getValue('PROVISIONING_RETRY_COUNT')));
    const now = Date.now();

    return records.map((task) => {
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
        steps: plan ? stepsFor(plan.provisioningType, task.assignment.accountIdentifier) : [],
        doneWhen: plan ? doneWhenFor(plan.provisioningType) : null,
        defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
        inGeneralQueue: inGeneralQueue({
          defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
          responsibleStillWorks: responsible?.status === 'ACTIVE',
        }),
        createdAt: task.createdAt,
        claimedBy: task.claimedByAppUserId,
        claimedAt: task.claimedAt,
        completedBy: task.completedByAppUserId,
        completedAt: task.completedAt,
        evidence: task.evidence,
        failedBy: task.failedByAppUserId,
        failedAt: task.failedAt,
        failureReason: task.failureReason,
        failureKind: task.failureKind,
        attempts: task.attempts,
        maxAttempts: limit,
        nextRetryAt: task.nextRetryAt,
        lastError: task.lastError,
        availableDecisions: availableDecisions(task.status, task.channel),
        handedOffBy: task.handedOffByAppUserId,
        handedOffAt: task.handedOffAt,
        handOffEvidence: task.handOffEvidence,
        closedBy: task.closedByAppUserId,
        closedAt: task.closedAt,
        closeReason: task.closeReason,
        elapsedSeconds: Math.max(0, Math.floor(((ended ? ended.getTime() : now) - task.createdAt.getTime()) / 1000)),
      };
    });
  }
}
