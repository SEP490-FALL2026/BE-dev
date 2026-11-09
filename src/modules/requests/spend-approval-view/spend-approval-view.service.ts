import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { chargedCostCenterId } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { PricingViewService } from '../request-view/pricing-view.service';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import { SpendReviewNotFoundError } from '../spend/spend.errors';
import { SpendStepRepo, type SpendStepRecord } from '../spend/spend-step.repo';
import type { ApprovalDetailWire } from './spend-approval.dto';
import { approvalDetailOf, detailPeopleIds, detailPlanIds } from './spend-approval.mapper';
import { SpendApprovalSnapshotService, type Person } from './spend-approval-snapshot.service';
import { SpendApprovalSourcesService } from './spend-approval-sources.service';

/**
 * What the spending approver reads of one request (`US-06-01` AC-3, AC-9, AC-10, AC-14): what it is, what the head confirmed, what it costs
 * with the tax that is deducted and the part that is not, what the IT Admin concluded of software that was not in the catalog, the budget of
 * the Cost Center as a check made now reads it (or, once decided, as the check kept with the decision read it), and what was decided. Only
 * the person the step is given to reads it, and the others are answered as if there were none.
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
    private readonly snapshots: SpendApprovalSnapshotService,
  ) {}

  /** The spend step of the request and what surrounds it. Throws SpendReviewNotFoundError for anybody who does not hold it. */
  async detail(actor: AuthenticatedPrincipal, requestId: string): Promise<ApprovalDetailWire> {
    const request = await this.requests.findById(requestId);
    const step = await this.steps.findLatest(requestId, 'SPEND_APPROVAL');
    if (!request || !step || step.assigneeEmployeeId !== actor.employeeId) throw new SpendReviewNotFoundError();

    const sources = await this.sources.load(requestId, request.branch, step.id);
    const { decision, assessment, proposal, confirmation } = sources;
    const { plans, person, center, cost } = await this.lookups(request, step, sources);

    return approvalDetailOf({
      requestId,
      step,
      request,
      decision,
      assessment,
      softwareName: proposal?.softwareName ?? null,
      plans,
      person,
      center,
      cost,
      budgetSnapshot: await this.snapshots.snapshotOf({
        request,
        step,
        decisionCheckId: decision?.checkId ?? null,
        confirmation,
        person,
      }),
      annualVendorAmount: await this.snapshots.annualVendorAmountOf(request),
    });
  }

  /** The plans, the people, the Cost Center and the cost the detail names, read together. */
  private async lookups(
    request: AccessRequestRecord,
    step: SpendStepRecord,
    sources: Awaited<ReturnType<SpendApprovalSourcesService['load']>>,
  ) {
    const { decision, assessment, confirmation } = sources;
    const planIds = detailPlanIds(request, assessment);
    const vendorId = request.planId
      ? await this.catalog.getPlanVendorId(request.planId)
      : (assessment?.vendorId ?? null);
    const [plans, people, department, centers, cost] = await Promise.all([
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.wireView.people([...detailPeopleIds(step, request, decision), confirmation?.confirmedByEmployeeId ?? null]),
      this.organizationReads.getDepartmentBrief(request.departmentId),
      this.organizationReads.costCentersByIds([chargedCostCenterId(request)]),
      this.pricing.costEstimate(request.pricing, vendorId),
    ]);
    const center = centers[0];
    if (!department || !center) throw new Error(`The request ${request.id} points at a missing record.`);
    const person: Person = (id) => people.get(id) as NonNullable<ReturnType<typeof people.get>>;

    return { plans, person, center, cost };
  }
}
