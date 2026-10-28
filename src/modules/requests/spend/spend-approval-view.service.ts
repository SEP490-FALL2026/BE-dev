import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { formatAmount } from '../../../core/money/money';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentRepo } from '../access-request/assessment.repo';
import { PricingViewService } from '../access-request/pricing-view.service';
import { codesOf } from './budget-check.policy';
import { BudgetCheckRepo } from './budget-check.repo';
import { BudgetInformationViewService } from './budget-information-view.service';
import { SpendBatchRepo } from './spend-batch.repo';
import { SpendDecisionRepo } from './spend-decision.repo';
import { SpendReadSupport } from './spend-read.support';
import { SpendReviewNotFoundError } from './spend.errors';
import { SpendStepRepo } from './spend-step.repo';
import type { ApprovalDetailWire, ApprovalSummaryWire } from './spend-approval.dto';

/**
 * What the spending approver reads (`US-06-01` AC-1, AC-3, AC-9, AC-10, AC-14): the requests waiting for them, and for one
 * of them what it is, what the head confirmed, what it costs with the tax that is deducted and the part that is not, what the
 * IT Admin concluded of software that was not in the catalog, and, once decided, what was decided. The check, its years and
 * the opinion of Finance are read from their own routes. Only the person the step is given to reads it, and the others are
 * answered as if there were none.
 */
@Injectable()
export class SpendApprovalViewService {
  constructor(
    private readonly steps: SpendStepRepo,
    private readonly requests: AccessRequestRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly batches: SpendBatchRepo,
    private readonly decisions: SpendDecisionRepo,
    private readonly assessments: AssessmentRepo,
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly pricing: PricingViewService,
    private readonly support: SpendReadSupport,
    private readonly information: BudgetInformationViewService,
  ) {}

  /** The spend steps waiting for the caller, the oldest first. */
  async queue(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<ApprovalSummaryWire>> {
    const { rows, total } = await this.steps.pageOpenSpendOf(
      actor.employeeId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const requestIds = rows.map((row) => row.requestId);
    const planIds = [...new Set(rows.map((row) => row.request.planId).filter((id): id is string => id !== null))];
    const [checks, batches, plans, people, units, centers] = await Promise.all([
      this.checks.latestOf(requestIds),
      this.batches.latestBatchOf(requestIds),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.support.people(
        rows.flatMap((row) => [
          row.request.requesterEmployeeId,
          row.request.type === 'GROUP_GRANT' ? null : (row.request.beneficiaries[0]?.employeeId ?? null),
        ]),
      ),
      this.support.units(rows.map((row) => row.request.amountCurrency)),
      // A step is only ever opened for a request that was sent, so it has its Cost Center; a draft has none and has no step.
      this.organization.costCentersByIds([
        ...new Set(rows.flatMap((row) => (row.request.costCenterId === null ? [] : [row.request.costCenterId]))),
      ]),
    ]);
    const items = rows.map((row): ApprovalSummaryWire => {
      const { request } = row;
      const plan = plans.find((candidate) => candidate.planId === request.planId);
      const requester = people.get(request.requesterEmployeeId);
      // A request for a group has no one person it is for: its people are read as lines.
      const beneficiary =
        request.type === 'GROUP_GRANT' ? null : (people.get(request.beneficiaries[0]?.employeeId ?? '') ?? undefined);
      const center = centers.find((candidate) => candidate.id === request.costCenterId);
      if (!requester || beneficiary === undefined || !center) {
        throw new Error(`The step ${row.id} points at a missing record.`);
      }
      const check = checks.get(row.requestId);

      return {
        requestId: row.requestId,
        stepId: row.id,
        openedAt: row.createdAt.toISOString(),
        slaWorkingDays: row.slaWorkingDays,
        plan: plan ? { planId: plan.planId, planName: plan.planName, applicationName: plan.applicationName } : null,
        softwareName: request.proposal?.softwareName ?? null,
        requester,
        beneficiary,
        lineCount: request._count.beneficiaries,
        costCenter: { id: center.id, code: center.code },
        amount:
          request.amountMinor !== null && request.amountCurrency !== null
            ? {
                amount: formatAmount(request.amountMinor, units.get(request.amountCurrency) ?? 2),
                currency: request.amountCurrency,
              }
            : null,
        primaryCode: check ? (codesOf(check)[0] ?? null) : null,
        samePersonAsSpend: row.samePersonAsSpend,
        noIndependentReview: row.noIndependentReview,
        offPlan: request.offPlan,
        batchId: batches.get(row.requestId) ?? null,
      };
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** The spend step of the request and what surrounds it. Throws SpendReviewNotFoundError for anybody who does not hold it. */
  async detail(actor: AuthenticatedPrincipal, requestId: string): Promise<ApprovalDetailWire> {
    const request = await this.requests.findById(requestId);
    const step = await this.steps.findLatest(requestId, 'SPEND_APPROVAL');
    if (!request || !step || step.assigneeEmployeeId !== actor.employeeId) throw new SpendReviewNotFoundError();

    const [decision, assessment, proposal, latestBudgetInformation] = await Promise.all([
      this.decisions.latest(requestId),
      request.branch === 'NEW_SOFTWARE' ? this.assessments.findAssessment(requestId) : Promise.resolve(null),
      request.branch === 'NEW_SOFTWARE' ? this.assessments.findProposal(requestId) : Promise.resolve(null),
      this.information.latestOfRequest(requestId),
    ]);
    const planIds = [request.planId, assessment?.equivalentPlanId ?? null].filter((id): id is string => id !== null);
    const vendorId = request.planId
      ? await this.catalog.getPlanVendorId(request.planId)
      : (assessment?.vendorId ?? null);
    const [plans, people, department, centers, cost] = await Promise.all([
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.support.people([
        step.assigneeEmployeeId,
        request.requesterEmployeeId,
        request.type === 'GROUP_GRANT' ? null : request.beneficiaryEmployeeIds[0],
        request.needDecision?.decidedByEmployeeId ?? null,
        decision?.decidedByEmployeeId ?? null,
      ]),
      this.organization.getDepartmentBrief(request.departmentId),
      this.organization.costCentersByIds([request.costCenterId]),
      this.pricing.costEstimate(request.pricing, vendorId),
    ]);
    const person = (id: string) => people.get(id) as NonNullable<ReturnType<typeof people.get>>;
    const plan = plans.find((candidate) => candidate.planId === request.planId);
    const equivalent = plans.find((candidate) => candidate.planId === assessment?.equivalentPlanId);
    const center = centers[0];
    if (!department || !center) throw new Error(`The request ${requestId} points at a missing record.`);

    return {
      requestId,
      step: {
        id: step.id,
        state: step.state as ApprovalDetailWire['step']['state'],
        waitingReason: step.waitingReason as ApprovalDetailWire['step']['waitingReason'],
        assignee: step.assigneeEmployeeId === null ? null : person(step.assigneeEmployeeId),
        openedAt: step.createdAt.toISOString(),
        decidedAt: step.decidedAt?.toISOString() ?? null,
        slaWorkingDays: step.slaWorkingDays,
        samePersonAsSpend: step.samePersonAsSpend,
        noIndependentReview: step.noIndependentReview,
      },
      request: this.requestView(request, plan, proposal?.softwareName ?? null, person, center),
      need: request.needDecision
        ? {
            decidedBy: person(request.needDecision.decidedByEmployeeId),
            decidedAt: request.needDecision.decidedAt.toISOString(),
            reason: request.needDecision.reason,
          }
        : null,
      cost,
      assessment: assessment
        ? {
            classification: assessment.classification,
            controlLevel: assessment.controlLevel,
            controlRiskNote: assessment.controlRiskNote,
            dataSensitivity: assessment.dataSensitivity,
            equivalentTool: equivalent ? { planId: equivalent.planId, planName: equivalent.planName } : null,
          }
        : null,
      decision: decision
        ? {
            decision: decision.decision,
            reason: decision.reason,
            overrideReason: decision.overrideReason,
            decidedBy: person(decision.decidedByEmployeeId),
            decidedAt: decision.decidedAt.toISOString(),
            bySubstitute: decision.bySubstitute,
          }
        : null,
      latestBudgetInformation,
    };
  }

  private requestView(
    request: AccessRequestRecord,
    plan: { planId: string; planName: string; applicationName: string } | undefined,
    softwareName: string | null,
    person: (id: string) => ApprovalSummaryWire['requester'],
    center: { id: string; code: string },
  ): ApprovalDetailWire['request'] {
    return {
      state: request.state,
      plan: plan ? { planId: plan.planId, planName: plan.planName, applicationName: plan.applicationName } : null,
      softwareName,
      requester: person(request.requesterEmployeeId),
      beneficiary: request.type === 'GROUP_GRANT' ? null : person(request.beneficiaryEmployeeIds[0]),
      lineCount: request.beneficiaryEmployeeIds.length,
      costCenter: { id: center.id, code: center.code },
      businessReason: request.businessReason,
      termMonths: request.termMonths,
      expectedSpendOn: request.pricing.expectedSpendOn,
      budgetYear: request.pricing.budgetYear,
      offPlan: request.offPlan,
      planLineAttached: request.planLine !== null,
    };
  }
}
