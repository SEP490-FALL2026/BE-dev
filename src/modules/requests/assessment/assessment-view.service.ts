import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import type { AssessmentRecord, ProposalRecord, Quote } from '../access-request/assessment-record.types';
import { judgeCompletion } from './assessment.policy';
import { AssessmentStepRepo, type AssessmentStepRecord } from './assessment-step.repo';
import { PricingViewService } from '../request-view/pricing-view.service';
import type { AssessmentWire } from './assessment.dto';

/** The assessment as a reader sees it: the declaration, what the IT Admin has filled, the quote, the price, the refusal. */
@Injectable()
export class AssessmentViewService {
  constructor(
    private readonly assessments: AssessmentReadRepo,
    private readonly steps: AssessmentStepRepo,
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
    private readonly pricing: PricingViewService,
  ) {}

  async of(request: AccessRequestRecord, assessment: AssessmentRecord, tx?: DbTx): Promise<AssessmentWire> {
    const proposal = await this.assessments.findProposal(request.id, tx);
    const step = await this.steps.find(request.id, tx);
    if (!proposal) throw new Error(`The proposal ${request.id} has no declaration.`);

    const peopleIds = [
      step?.assigneeEmployeeId,
      assessment.proposedBusinessOwnerEmployeeId,
      assessment.completedByEmployeeId,
      assessment.rejectedByEmployeeId,
    ].filter((id): id is string => id !== null && id !== undefined);
    const planIds = [assessment.equivalentPlanId, assessment.alternativePlanId].filter(
      (id): id is string => id !== null,
    );
    const people = await this.organization.getEmployees([...new Set(peopleIds)], tx);
    const plans = planIds.length > 0 ? await this.catalog.getPlanSummaries(planIds) : [];
    const priceView = await this.pricing.view(request.pricing);
    const costEstimate = await this.pricing.costEstimate(request.pricing, assessment.vendorId, tx);
    const quote = assessment.quote ? await this.quoteView(assessment.quote) : null;
    const person = (id: string | null | undefined) => {
      const found = id ? people.find((candidate) => candidate.id === id) : undefined;

      return found ? { employeeId: found.id, employeeCode: found.employeeCode, fullName: found.fullName } : null;
    };

    return {
      requestId: request.id,
      status: assessment.status,
      proposal: toProposalWire(proposal),
      step: step && toStepWire(step, person(step.assigneeEmployeeId)),
      classification: assessment.classification,
      vendor: { vendorId: assessment.vendorId, name: assessment.vendorName },
      plannedPlanName: assessment.plannedPlanName,
      provisioningType: assessment.provisioningType,
      adminConsole: assessment.adminConsole,
      memberExport: assessment.memberExport,
      sso: assessment.sso,
      termsSummary: assessment.termsSummary,
      memberUsageMethod: assessment.memberUsageMethod,
      grantRevokeMethod: assessment.grantRevokeMethod,
      dataSensitivity: assessment.dataSensitivity,
      opinion: assessment.opinionStatus && { status: assessment.opinionStatus, note: assessment.opinionNote },
      equivalentTool: toolOf(plans, assessment.equivalentPlanId),
      proposedBusinessOwner: person(assessment.proposedBusinessOwnerEmployeeId),
      controlLevel: assessment.controlLevel,
      controlRiskNote: assessment.controlRiskNote,
      quote,
      complete: judgeCompletion(assessment).kind === 'OK',
      pricing: priceView,
      costEstimate,
      completedBy: person(assessment.completedByEmployeeId),
      completedAt: assessment.completedAt?.toISOString() ?? null,
      rejection:
        assessment.rejectionKind && assessment.rejectionReason && assessment.rejectedAt
          ? {
              kind: assessment.rejectionKind,
              reason: assessment.rejectionReason,
              alternative: { plan: toolOf(plans, assessment.alternativePlanId), note: assessment.alternativeNote },
              rejectedBy: person(assessment.rejectedByEmployeeId) as NonNullable<ReturnType<typeof person>>,
              rejectedAt: assessment.rejectedAt.toISOString(),
            }
          : null,
    };
  }

  private async quoteView(quote: Quote): Promise<NonNullable<AssessmentWire['quote']>> {
    return {
      unitPrice: await this.pricing.moneyView(quote.unitPrice),
      billingCycle: quote.billingCycle,
      validFrom: quote.validFrom,
      validUntil: quote.validUntil,
      commitmentMonths: quote.commitmentMonths,
      paymentFrequency: quote.paymentFrequency,
      firstPaymentOn: quote.firstPaymentOn,
    };
  }
}

/** A plan of the catalog as the assessment names it: the plan and the application it belongs to. */
const toolOf = (
  plans: ReadonlyArray<{ planId: string; planName: string; applicationName: string }>,
  planId: string | null,
): { planId: string; planName: string; applicationName: string } | null => {
  const found = planId === null ? undefined : plans.find((plan) => plan.planId === planId);

  return found ? { planId: found.planId, planName: found.planName, applicationName: found.applicationName } : null;
};

const toProposalWire = (proposal: ProposalRecord): AssessmentWire['proposal'] => ({ ...proposal });

const toStepWire = (
  step: AssessmentStepRecord,
  assignee: AssessmentWire['proposedBusinessOwner'],
): NonNullable<AssessmentWire['step']> => ({
  state: step.state,
  assignee,
  waitingReason: step.waitingReason,
  slaWorkingDays: step.slaWorkingDays,
  assignedAt: step.assignedAt?.toISOString() ?? null,
  decidedAt: step.decidedAt?.toISOString() ?? null,
});
