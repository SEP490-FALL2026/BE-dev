import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import type { ProposalRecord } from '../access-request/assessment-record.types';
import { PricingViewService, type MoneyView, type PricingView } from './pricing-view.service';
import type { BlockReason } from '../spend/budget-check.policy';
import type { SpendStage } from '../access-request/access-request.types';
import { SpendStatusService, type SpendStatusView } from '../spend/spend-status.service';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { viewFactsOf, hasSpendStep } from '../access-request/access-request.policy';
import { RequestReadAccessService } from './request-read-access.service';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, ApprovalRecordRecord, NeedStepRecord } from '../access-request/access-request.types';
import type { ReadableCancelCause } from '../access-request/group-request.types';

export interface EmployeeRefView {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

/** The decision of the need step as a reader sees it: who decided, in which role, what, why and when. */
export interface NeedDecisionView extends Omit<ApprovalRecordRecord, 'decidedByEmployeeId'> {
  decidedBy: EmployeeRefView;
}

export interface NeedStepView extends Omit<
  NeedStepRecord,
  'assigneeEmployeeId' | 'samePersonAsSpend' | 'slaWorkingDays'
> {
  assignee: EmployeeRefView | null;
  slaWorkingDays: number | null;
}

/** Where the request stands on its way to the spending approver, as the wire writes it (`BR-MF1-06g`). */
export interface SpendView {
  stage: SpendStage;
  blockedReasons: (BlockReason | 'PRICE_MISSING' | 'RATE_MISSING')[];
  /** How far over the base (waiting for the reserve to be confirmed) or over the reserve (blocked for that); null otherwise. */
  overBy: MoneyView | null;
  refusalReason: string | null;
}

/** A request as a reader sees it: the record with the names of the people, the plan, the department and the Cost Center. */
export interface AccessRequestView extends Omit<
  AccessRequestRecord,
  | 'organizationId'
  | 'oneStepBlockedReason'
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
  | 'budgetYear'
  | 'planLine'
  | 'offPlan'
> {
  plan: { planId: string; planName: string; applicationId: string; applicationName: string } | null;
  /** What the Employee declared of software that is not in the catalog; null for any other request. */
  proposal: ProposalRecord | null;
  department: { id: string; code: string; name: string };
  /** Null for a free internal request of a department that has no Cost Center in use (`QĐ-87g(2)`). */
  costCenter: { id: string; code: string } | null;
  requester: EmployeeRefView;
  /** The one person it is for; null for a request for a group, which reads its people from `GET /access-requests/{id}/lines`. */
  beneficiary: EmployeeRefView | null;
  /** How many people the request is for, those refused or withdrawn included: 1 for any request but one for a group. */
  lineCount: number;
  /** The chain of steps is not listed: whether a spend step stands in it is the one fact a reader needs. */
  policy: { version: number; hasSpendStep: boolean; slaWorkingDays: number };
  budgetYear: number | null;
  pricing: PricingView;
  /** Where the request stands on its way to the spending approver, for a request that costs money; never what is left of the budget. */
  spend: SpendView | null;
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
  /**
   * What the head and the spending approver are shown of the request (`BR-MF1-01g`): GH-3, the person uses many paid applications,
   * with how many and why they ask for more; null when it is not flagged. A request for a group carries it on its lines.
   */
  flags: { manyPaidSoftware: { count: number; reason: string } | null };
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
  /** Null when the conversion command closed the request for the spending approver (`SPENDING_APPROVER_PARTY`, OD-6). */
  cancelledBy: EmployeeRefView | null;
  cancelledAt: Date;
  cause: ReadableCancelCause;
  note: string | null;
}

/** Reading a request (`US-05-03` AC-12: who holds the step and why). Only the people `canReadRequest` names see it. */
@Injectable()
export class AccessRequestQueryService {
  constructor(
    private readonly repo: AccessRequestRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly pricing: PricingViewService,
    private readonly assessments: AssessmentReadRepo,
    private readonly spendStatus: SpendStatusService,
    private readonly readAccess: RequestReadAccessService,
  ) {}

  async get(actor: AuthenticatedPrincipal, id: string): Promise<AccessRequestView> {
    const record = await this.repo.findById(id);
    // Whoever reads the history of the request reads its detail too: the head of its department, the spending approver once a
    // spend step was opened, Finance once its spend was approved (`US-06-09` AC-2). Nobody else learns that it exists.
    const access = record && (await this.readAccess.accessOf(actor, this.subjectOf(record)));
    if (!record || !access?.read) throw new AccessRequestNotFoundError();

    return this.view(record);
  }

  private subjectOf(record: AccessRequestRecord) {
    return {
      ...viewFactsOf(record),
      id: record.id,
      isGroup: record.type === 'GROUP_GRANT',
      departmentId: record.departmentId,
    };
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
      this.organizationReads.getEmployees(peopleIds),
      record.planId === null ? Promise.resolve([]) : this.catalog.getPlanSummaries([record.planId]),
      this.organizationReads.getDepartmentBrief(record.departmentId),
      record.costCenterId === null
        ? Promise.resolve([])
        : this.organizationReads.costCentersByIds([record.costCenterId]),
      record.branch === 'NEW_SOFTWARE' ? this.assessments.findProposal(record.id) : Promise.resolve(null),
      this.spendStatus.of(record),
    ]);
    const spendView = spend && (await this.spendViewOf(spend));
    const person = (id: string): EmployeeRefView => {
      const found = people.find((candidate) => candidate.id === id);
      if (!found) throw new Error(`The employee ${id} of the request ${record.id} does not exist.`);

      return { employeeId: found.id, employeeCode: found.employeeCode, fullName: found.fullName };
    };
    const plan = plans[0] ?? null;
    const costCenter = costCenters[0] ?? null;
    if ((record.planId !== null && !plan) || !department || (record.costCenterId !== null && !costCenter)) {
      throw new Error(`The request ${record.id} points at a missing record.`);
    }

    const { assigneeEmployeeId, ...legacyStep } = needStep;
    const step = { ...legacyStep };
    Reflect.deleteProperty(step, 'samePersonAsSpend');
    const decision = record.needDecision;

    return {
      id: record.id,
      type: record.type,
      branch: record.branch,
      state: record.state,
      routing: record.routing ?? { mode: 'VIA_HEAD', oneStepReason: null },
      plan: plan && {
        planId: plan.planId,
        planName: plan.planName,
        applicationId: plan.applicationId,
        applicationName: plan.applicationName,
      },
      proposal,
      department: { id: department.id, code: department.code, name: department.name },
      costCenter: costCenter && { id: costCenter.id, code: costCenter.code },
      requester: person(record.requesterEmployeeId),
      beneficiary: beneficiaryId === null ? null : person(beneficiaryId),
      lineCount: record.beneficiaryEmployeeIds.length,
      businessReason: record.businessReason,
      termMonths: record.termMonths,
      expectedEndDate: record.expectedEndDate,
      spend: spendView,
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
              cancelledBy:
                record.cancellation.cancelledByEmployeeId === null
                  ? null
                  : person(record.cancellation.cancelledByEmployeeId),
              cancelledAt: record.cancellation.cancelledAt,
              cause: record.cancellation.cause,
              note: record.cancellation.note,
            },
      serviceAccount: this.serviceAccountOf(record.serviceAccount, person),
      flags: { manyPaidSoftware: record.manyPaidSoftware ?? null },
      renewal: this.renewalOf(record.renewal),
      needStep: {
        ...step,
        slaWorkingDays: step.state === 'NOT_REQUIRED' ? null : step.slaWorkingDays,
        assignee: assigneeEmployeeId === null ? null : person(assigneeEmployeeId),
      },
      needDecision:
        decision === null
          ? null
          : {
              decision: decision.decision,
              decidedBy: person(decision.decidedByEmployeeId),
              deciderRole: decision.deciderRole,
              reason: decision.reason,
              decidedAt: decision.decidedAt,
            },
    };
  }

  private async spendViewOf(status: SpendStatusView): Promise<SpendView> {
    return {
      stage: status.stage,
      blockedReasons: status.blockedReasons,
      overBy:
        status.overBy &&
        (await this.pricing.moneyView({ amountMinor: status.overBy.minor, currency: status.overBy.currency })),
      refusalReason: status.refusalReason,
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
