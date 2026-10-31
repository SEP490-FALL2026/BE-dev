import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { chargedCostCenterId } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { PricingViewService } from '../request-view/pricing-view.service';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import { SpendReviewNotFoundError } from '../spend/spend.errors';
import { SpendStepRepo } from '../spend/spend-step.repo';
import type { ApprovalDetailWire } from './spend-approval.dto';
import { approvalDetailOf, detailPeopleIds, detailPlanIds } from './spend-approval.mapper';
import { SpendApprovalSourcesService } from './spend-approval-sources.service';

/**
 * What the spending approver reads of one request (`US-06-01` AC-3, AC-9, AC-10, AC-14): what it is, what the head confirmed, what it costs with the tax that is deducted and the part that is not, what the
 * IT Admin concluded of software that was not in the catalog, and, once decided, what was decided. The check, its years and
 * the opinion of Finance are read from their own routes. Only the person the step is given to reads it, and the others are
 * answered as if there were none.
 */
@Injectable()
export class SpendApprovalViewService {
  constructor(
    private readonly steps: SpendStepRepo,
    private readonly requests: AccessRequestRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly pricing: PricingViewService,
    private readonly wireView: SpendWireViewService,
    private readonly sources: SpendApprovalSourcesService,
  ) {}

  /** The spend step of the request and what surrounds it. Throws SpendReviewNotFoundError for anybody who does not hold it. */
  async detail(actor: AuthenticatedPrincipal, requestId: string): Promise<ApprovalDetailWire> {
    const request = await this.requests.findById(requestId);
    const step = await this.steps.findLatest(requestId, 'SPEND_APPROVAL');
    if (!request || !step || step.assigneeEmployeeId !== actor.employeeId) throw new SpendReviewNotFoundError();

    const { decision, assessment, proposal, latestBudgetInformation } = await this.sources.load(
      requestId,
      request.branch,
    );
    const planIds = detailPlanIds(request, assessment);
    const vendorId = request.planId
      ? await this.catalog.getPlanVendorId(request.planId)
      : (assessment?.vendorId ?? null);
    const [plans, people, department, centers, cost] = await Promise.all([
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.wireView.people(detailPeopleIds(step, request, decision)),
      this.organizationReads.getDepartmentBrief(request.departmentId),
      this.organizationReads.costCentersByIds([chargedCostCenterId(request)]),
      this.pricing.costEstimate(request.pricing, vendorId),
    ]);
    const center = centers[0];
    if (!department || !center) throw new Error(`The request ${requestId} points at a missing record.`);

    return approvalDetailOf({
      requestId,
      step,
      request,
      decision,
      assessment,
      softwareName: proposal?.softwareName ?? null,
      plans,
      person: (id: string) => people.get(id) as NonNullable<ReturnType<typeof people.get>>,
      center,
      cost,
      latestBudgetInformation,
    });
  }
}
