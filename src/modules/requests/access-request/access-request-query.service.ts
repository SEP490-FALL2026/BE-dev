import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsService } from '../../budgets/budgets.service';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { AssessmentRepo, type ProposalRecord } from './assessment.repo';
import { PricingViewService, type PricingView } from './pricing-view.service';
import { SpendStatusService, type SpendStatusView } from '../spend/spend-status.service';
import { AccessRequestNotFoundError } from './access-request.errors';
import { canViewRequest, viewFactsOf, hasSpendStep } from './access-request.policy';
import { AccessRequestRepo } from './access-request.repo';
import type { AccessRequestRecord, ApprovalRecordRecord, NeedStepRecord } from './access-request.types';
import type { ReadableCancelCause } from '../group-request/group-request.types';

export interface EmployeeRefView {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

/** The decision of the need step as a reader sees it: who decided, in which role, what, why and when. */
export interface NeedDecisionView extends Omit<ApprovalRecordRecord, 'decidedByEmployeeId'> {
  decidedBy: EmployeeRefView;
}

export interface NeedStepView extends Omit<NeedStepRecord, 'assigneeEmployeeId'> {
  assignee: EmployeeRefView | null;
}

/** A request as a reader sees it: the record with the names of the people, the plan, the department and the Cost Center. */
export interface AccessRequestView extends Omit<
  AccessRequestRecord,
  | 'organizationId'
  | 'planId'
  | 'departmentId'
  | 'costCenterId'
  | 'requesterEmployeeId'
  | 'beneficiaryEmployeeIds'
  | 'needStep'
  | 'needSteps'
  | 'lines'
  | 'needDecision'
  | 'withdrawal'
  | 'cancellation'
  | 'serviceAccount'
  | 'renewal'
  | 'policy'
  | 'pricing'
  | 'expectedSpendOn'
  | 'budgetYear'
  | 'planLine'
> {
  plan: { planId: string; planName: string; applicationId: string; applicationName: string } | null;
  /** What the Employee declared of software that is not in the catalog; null for any other request. */
  proposal: ProposalRecord | null;
  department: { id: string; code: string; name: string };
  costCenter: { id: string; code: string };
  requester: EmployeeRefView;
  /** The one person it is for; null for a request for a group, which reads its people from `GET /access-requests/{id}/lines`. */
  beneficiary: EmployeeRefView | null;
  /** How many people the request is for, those refused or withdrawn included: 1 for any request but one for a group. */
  lineCount: number;
  /** The chain of steps is not listed: whether a spend step stands in it is the one fact a reader needs. */
  policy: { version: number; hasSpendStep: boolean; slaWorkingDays: number };
  expectedSpendOn: string | null;
  budgetYear: number | null;
  pricing: PricingView;
  /** Whether the head attached the request to a line of the plan of the budget; the line itself is read from the budget. */
  planLineAttached: boolean;
  /** Where the request stands on its way to the spending approver, for a request that costs money; never a figure of the budget. */
  spend: SpendStatusView | null;
  needStep: NeedStepView;
  /** Null until the need step is decided. */
  needDecision: NeedDecisionView | null;
  /** Who withdrew the request, when and why; null unless it was withdrawn or waits for the IT Admin to close its task. */
  withdrawal: WithdrawalView | null;
  /** Who closed the request because its beneficiary left, when, why and the note given; null for any other request. */
  cancellation: CancellationView | null;
  /** What a request for the renewal of a right adds; null for any other request. */
  renewal: RenewalView | null;
  /** What a request for a service account adds; null for any other request. */
  serviceAccount: ServiceAccountView | null;
}

export interface RenewalView {
  assignmentId: string;
  previousExpectedEndDate: string;
  newExpectedEndDate: string;
  consecutiveMonths: number;
  /** The record approval wrote after the old one; null until the request is approved. */
  applied: { successorAssignmentId: string; appliedAt: Date } | null;
}

export interface ServiceAccountView {
  purpose: string;
  expectedIdentifier: string;
  responsible: EmployeeRefView;
  boundary: {
    state: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    reason: string | null;
    decidedBy: EmployeeRefView | null;
    decidedAt: Date | null;
    selfExecuted: boolean;
  };
}

export interface WithdrawalView {
  requestedBy: EmployeeRefView;
  requestedAt: Date;
  reason: string | null;
  /** Null while the IT Admin has still to close the task of the grant that failed. */
  withdrawnAt: Date | null;
}

export interface CancellationView {
  cancelledBy: EmployeeRefView;
  cancelledAt: Date;
  cause: ReadableCancelCause;
  note: string | null;
}

/** Reading a request (`US-05-03` AC-12: who holds the step and why). Only the people with a part in it see it. */
@Injectable()
export class AccessRequestQueryService {
  constructor(
    private readonly repo: AccessRequestRepo,
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingViewService,
    private readonly assessments: AssessmentRepo,
    private readonly spendStatus: SpendStatusService,
    private readonly budgets: BudgetsService,
  ) {}

  async get(actor: AuthenticatedPrincipal, id: string): Promise<AccessRequestView> {
    const record = await this.repo.findById(id);
    // Finance reads the request a commitment was made for, to follow the commitment back to it (`US-06-09` AC-2).
    const visible =
      record !== null &&
      (canViewRequest(actor, viewFactsOf(record)) ||
        (actor.roles.includes('FINANCE') && (await this.budgets.requestHoldsCommitment(record.id))));
    if (!visible) throw new AccessRequestNotFoundError();

    return this.view(record);
  }

  /** The record with its names, read in the calls of the facades of the other modules (one read each, not one per row). */
  async view(record: AccessRequestRecord): Promise<AccessRequestView> {
    const { needStep } = record;
    const beneficiaryId = record.type === 'GROUP_GRANT' ? null : record.beneficiaryEmployeeIds[0];
    const peopleIds = [
      ...new Set(
        [
          record.requesterEmployeeId,
          beneficiaryId,
          needStep.assigneeEmployeeId,
          record.needDecision?.decidedByEmployeeId ?? null,
          record.withdrawal?.requestedByEmployeeId ?? null,
          record.cancellation?.cancelledByEmployeeId ?? null,
          record.serviceAccount?.responsibleEmployeeId ?? null,
          record.serviceAccount?.boundaryDecidedByEmployeeId ?? null,
        ].filter((v) => v !== null),
      ),
    ];
    const [people, plans, department, costCenters, proposal, spend] = await Promise.all([
      this.organization.getEmployees(peopleIds),
      record.planId === null ? Promise.resolve([]) : this.catalog.getPlanSummaries([record.planId]),
      this.organization.getDepartmentBrief(record.departmentId),
      this.organization.costCentersByIds([record.costCenterId]),
      record.branch === 'NEW_SOFTWARE' ? this.assessments.findProposal(record.id) : Promise.resolve(null),
      this.spendStatus.of(record),
    ]);
    const person = (id: string): EmployeeRefView => {
      const found = people.find((candidate) => candidate.id === id);
      if (!found) throw new Error(`The employee ${id} of the request ${record.id} does not exist.`);

      return { employeeId: found.id, employeeCode: found.employeeCode, fullName: found.fullName };
    };
    const plan = plans[0] ?? null;
    const costCenter = costCenters[0];
    if ((record.planId !== null && !plan) || !department || !costCenter) {
      throw new Error(`The request ${record.id} points at a missing record.`);
    }

    const { assigneeEmployeeId, ...step } = needStep;
    const decision = record.needDecision;

    return {
      id: record.id,
      type: record.type,
      branch: record.branch,
      state: record.state,
      plan: plan && {
        planId: plan.planId,
        planName: plan.planName,
        applicationId: plan.applicationId,
        applicationName: plan.applicationName,
      },
      proposal,
      department: { id: department.id, code: department.code, name: department.name },
      costCenter: { id: costCenter.id, code: costCenter.code },
      requester: person(record.requesterEmployeeId),
      beneficiary: beneficiaryId === null ? null : person(beneficiaryId),
      lineCount: record.beneficiaryEmployeeIds.length,
      businessReason: record.businessReason,
      termMonths: record.termMonths,
      projectLabel: record.projectLabel,
      offPlan: record.offPlan,
      delegatedBatchId: record.delegatedBatchId,
      expectedEndDate: record.expectedEndDate,
      planLineAttached: record.planLine !== null,
      spend,
      expectedSpendOn: record.pricing.expectedSpendOn,
      budgetYear: record.pricing.budgetYear,
      pricing: await this.pricing.view(record.pricing),
      policy: {
        version: record.policy.version,
        hasSpendStep: hasSpendStep(record.policy),
        slaWorkingDays: record.policy.slaWorkingDays,
      },
      submittedAt: record.submittedAt,
      withdrawal:
        record.withdrawal === null
          ? null
          : {
              requestedBy: person(record.withdrawal.requestedByEmployeeId),
              requestedAt: record.withdrawal.requestedAt,
              reason: record.withdrawal.reason,
              withdrawnAt: record.withdrawal.withdrawnAt,
            },
      cancellation:
        record.cancellation === null
          ? null
          : {
              cancelledBy: person(record.cancellation.cancelledByEmployeeId),
              cancelledAt: record.cancellation.cancelledAt,
              cause: record.cancellation.cause,
              note: record.cancellation.note,
            },
      serviceAccount: this.serviceAccountOf(record.serviceAccount, person),
      renewal: this.renewalOf(record.renewal),
      needStep: { ...step, assignee: assigneeEmployeeId === null ? null : person(assigneeEmployeeId) },
      needDecision:
        decision === null
          ? null
          : {
              decision: decision.decision,
              decidedBy: person(decision.decidedByEmployeeId),
              deciderRole: decision.deciderRole,
              reason: decision.reason,
              termConfirmationReason: decision.termConfirmationReason,
              decidedAt: decision.decidedAt,
            },
    };
  }

  private renewalOf(detail: AccessRequestRecord['renewal']): RenewalView | null {
    if (detail === null) return null;

    return {
      assignmentId: detail.assignmentId,
      previousExpectedEndDate: detail.previousExpectedEndDate,
      newExpectedEndDate: detail.newExpectedEndDate,
      consecutiveMonths: detail.consecutiveMonths,
      applied:
        detail.successorAssignmentId !== null && detail.appliedAt !== null
          ? { successorAssignmentId: detail.successorAssignmentId, appliedAt: detail.appliedAt }
          : null,
    };
  }

  private serviceAccountOf(
    detail: AccessRequestRecord['serviceAccount'],
    person: (id: string) => EmployeeRefView,
  ): ServiceAccountView | null {
    if (detail === null) return null;
    const { boundaryDecidedByEmployeeId: decidedById } = detail;

    return {
      purpose: detail.purpose,
      expectedIdentifier: detail.expectedIdentifier,
      responsible: person(detail.responsibleEmployeeId),
      boundary: {
        state: detail.boundaryState,
        reason: detail.boundaryReason,
        decidedBy: decidedById === null ? null : person(decidedById),
        decidedAt: detail.boundaryDecidedAt,
        selfExecuted: detail.boundarySelfExecuted,
      },
    };
  }
}
