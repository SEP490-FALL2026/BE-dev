import { Module, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { BudgetsService } from '../budgets/budgets.service';
import { CatalogModule } from '../catalog/catalog.module';
import { LicensingModule } from '../licensing/licensing.module';
import { LicensingService } from '../licensing/licensing.service';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccessRequestGrantGate } from './access-request/access-request-grant.gate';
import { DelegatedRequestService } from './access-request/delegated-request.service';
import { DelegatedRequestsController } from './access-request/delegated-requests.controller';
import { GrantQueueRepo } from './access-request/grant-queue.repo';
import { GrantQueueService } from './access-request/grant-queue.service';
import { RequestCommitmentReleaseGuard } from './spend/commitment-release.guard';
import { RequestDraftService } from './access-request/request-draft.service';
import { RequestDraftSubmitService } from './access-request/request-draft-submit.service';
import { RequestDraftsController } from './access-request/request-drafts.controller';
import { RequestOutcomeListeners } from './access-request/request-outcome-listeners';
import { AssessmentRepo } from './access-request/assessment.repo';
import { AssessmentService } from './access-request/assessment.service';
import { AssessmentViewService } from './access-request/assessment-view.service';
import { AssessmentStepRepo } from './access-request/assessment-step.repo';
import { CatalogLinkService } from './access-request/catalog-link.service';
import { QuoteService } from './access-request/quote.service';
import { InternalRegistrationService } from './access-request/internal-registration.service';
import { ProposalService } from './access-request/proposal.service';
import { ProposalsController } from './access-request/proposals.controller';
import { AccessRequestQueryService } from './access-request/access-request-query.service';
import { AccessRequestRepo } from './access-request/access-request.repo';
import { AccessRequestService } from './access-request/access-request.service';
import { AccessRequestsController } from './access-request/access-requests.controller';
import { NeedDecisionService } from './access-request/need-decision.service';
import { NeedSpendService } from './access-request/need-spend.service';
import { WithdrawalService } from './access-request/withdrawal.service';
import { CancellationController } from './access-request/cancellation.controller';
import { DepartureCancellationService } from './access-request/departure-cancellation.service';
import { OpenRequestRepo } from './access-request/open-request.repo';
import { OpenRequestService } from './access-request/open-request.service';
import { CostCenterOpenRequestsReader } from './access-request/cost-center-open-requests.reader';
import { DepartmentOpenRequestsReader } from './access-request/department-open-requests.reader';
import { RequestUseRepo } from './access-request/request-use.repo';
import { RequestEndService } from './access-request/request-end.service';
import { RequestsService } from './requests.service';
import { PricingViewService } from './access-request/pricing-view.service';
import { RequestAssessmentService } from './access-request/request-assessment.service';
import { RequestPreviewService } from './access-request/request-preview.service';
import { SimilarSeatsService } from './access-request/similar-seats.service';
import { GroupCandidateService } from './group-request/group-candidate.service';
import { GroupGrantService } from './group-request/group-grant.service';
import { GroupLineQueryService } from './group-request/group-line-query.service';
import { GroupLineClosureController } from './group-request/group-line-closure.controller';
import { GroupLineClosureService } from './group-request/group-line-closure.service';
import { GroupLinesController } from './group-request/group-lines.controller';
import { GroupNeedDecisionService } from './group-request/group-need-decision.service';
import { GroupRequestService } from './group-request/group-request.service';
import { GroupRequestsController } from './group-request/group-requests.controller';
import { GroupResolutionService } from './group-request/group-resolution.service';
import { GroupSpendDecisionService } from './group-request/group-spend-decision.service';
import { GroupSpendRecordService } from './group-request/group-spend-record.service';
import { GroupSupplementService } from './group-request/group-supplement.service';
import { GroupSubmissionFactsService } from './group-request/group-submission-facts.service';
import { GroupWithdrawalService } from './group-request/group-withdrawal.service';
import { LineAmountRepo } from './group-request/line-amount.repo';
import { LineDecisionRepo } from './group-request/line-decision.repo';
import { RequestLineRepo } from './group-request/request-line.repo';
import { SupplementDropRepo } from './group-request/supplement-drop.repo';
import { ControlledWaitController } from './reassignment/controlled-wait.controller';
import { CongestionController } from './sla/congestion.controller';
import { CongestionService } from './sla/congestion.service';
import { RequestsWorkFacadeModule } from './requests-work-facade.module';
import { BudgetCheckRepo } from './spend/budget-check.repo';
import { BudgetCheckService } from './spend/budget-check.service';
import { FinanceReviewRepo } from './spend/finance-review.repo';
import { FinanceReviewService } from './spend/finance-review.service';
import { FinanceReviewsController } from './spend/finance-reviews.controller';
import { PlanLineRouteService } from './spend/plan-line-route.service';
import { PlanLineService } from './spend/plan-line.service';
import { BudgetInformationController } from './spend/budget-information.controller';
import { BudgetInformationRepo } from './spend/budget-information.repo';
import { BudgetInformationService } from './spend/budget-information.service';
import { BudgetInformationViewService } from './spend/budget-information-view.service';
import { SpendApprovalViewService } from './spend/spend-approval-view.service';
import { SpendApprovalsController } from './spend/spend-approvals.controller';
import { SpendBatchDecisionService } from './spend/spend-batch-decision.service';
import { SpendBatchRepo } from './spend/spend-batch.repo';
import { SpendDecisionRepo } from './spend/spend-decision.repo';
import { SpendDecisionService } from './spend/spend-decision.service';
import { SpendBatchService } from './spend/spend-batch.service';
import { SpendBatchViewService } from './spend/spend-batch-view.service';
import { SpendEffectsService } from './spend/spend-effects.service';
import { SpendEntryService } from './spend/spend-entry.service';
import { SpendHeadService } from './spend/spend-head.service';
import { SpendQueueService } from './spend/spend-queue.service';
import { SpendReadSupport } from './spend/spend-read.support';
import { SpendSubmissionController } from './spend/spend-submission.controller';
import { SupplementRepo } from './spend/supplement.repo';
import { SupplementService } from './spend/supplement.service';
import { RepricingService } from './access-request/repricing.service';
import { SpendBudgetListener } from './spend/spend-budget.listener';
import { SpendRequestRepo } from './spend/spend-request.repo';
import { SpendRoutingService } from './spend/spend-routing.service';
import { SpendStatusService } from './spend/spend-status.service';
import { SpendStepRepo } from './spend/spend-step.repo';
import { SpendViewService } from './spend/spend-view.service';
import { RenewalApplyService } from './renewal-request/renewal-apply.service';
import { RenewalHoldReader } from './renewal-request/renewal-hold.reader';
import { RenewalRequestRepo } from './renewal-request/renewal-request.repo';
import { RenewalRequestTrail } from './renewal-request/renewal-request-trail';
import { RenewalRequestService } from './renewal-request/renewal-request.service';
import { RenewalRequestsController } from './renewal-request/renewal-requests.controller';
import { ReturnRequestQueryService } from './return-request/return-request-query.service';
import { ReturnRequestRepo } from './return-request/return-request.repo';
import { ReturnRequestService } from './return-request/return-request.service';
import { ReturnRequestsController } from './return-request/return-requests.controller';
import { ReturnRevocationHook } from './return-request/return-revocation.hook';
import { RequestTimingRepo } from './status/request-timing.repo';
import { RequestTimingService } from './status/request-timing.service';
import { RequestTimingsController } from './status/request-timings.controller';
import { ServiceAccountBoundaryService } from './service-account-request/service-account-boundary.service';
import { ServiceAccountRequestRepo } from './service-account-request/service-account-request.repo';
import { ServiceAccountRequestService } from './service-account-request/service-account-request.service';
import { ServiceAccountRequestsController } from './service-account-request/service-account-requests.controller';

/**
 * The requests context (C4, ADR-0015): the request for access to software, the people it is for and the steps that decide
 * it. It reads the organization, the approval roles, the catalog and the operating parameters through their facades and
 * writes nothing of theirs. The HTTP controller lives in the module itself because no graph other than the API needs it
 * yet; the part the worker runs (the reassignment of steps when the organization or a role changes) is
 * `RequestsWorkFacadeModule`, which this module imports for who a step is given to and the queue of the steps that wait.
 * It exports its facade `RequestsService`, which gives the personnel context the requests of a person who leaves that are still open.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    CatalogModule,
    FinanceModule,
    BudgetsModule,
    LicensingModule,
    OperatingParametersModule,
    RequestsWorkFacadeModule,
  ],
  controllers: [
    // The path `access-requests/drafts` is declared before `access-requests/:id`, so that it is a route of its own and never an id.
    RequestDraftsController,
    AccessRequestsController,
    CancellationController,
    ProposalsController,
    FinanceReviewsController,
    SpendSubmissionController,
    SpendApprovalsController,
    BudgetInformationController,
    DelegatedRequestsController,
    ServiceAccountRequestsController,
    ReturnRequestsController,
    RenewalRequestsController,
    ControlledWaitController,
    RequestTimingsController,
    CongestionController,
    GroupRequestsController,
    GroupLinesController,
    GroupLineClosureController,
  ],
  providers: [
    AccessRequestRepo,
    AssessmentRepo,
    AssessmentStepRepo,
    PricingViewService,
    RequestAssessmentService,
    RequestPreviewService,
    AccessRequestService,
    RequestDraftService,
    RequestDraftSubmitService,
    // The registry of the listeners of the outcome of a request (F43): a context registers through `RequestsService.registerOutcomeListener`.
    RequestOutcomeListeners,
    ProposalService,
    QuoteService,
    AssessmentViewService,
    AssessmentService,
    CatalogLinkService,
    InternalRegistrationService,
    AccessRequestQueryService,
    NeedDecisionService,
    NeedSpendService,
    RequestEndService,
    WithdrawalService,
    DepartureCancellationService,
    OpenRequestRepo,
    OpenRequestService,
    // What the organization asks before it retires a department or a Cost Center (F15, F16): the requests that are not over.
    RequestUseRepo,
    DepartmentOpenRequestsReader,
    CostCenterOpenRequestsReader,
    RequestsService,
    SimilarSeatsService,
    AccessRequestGrantGate,
    RequestCommitmentReleaseGuard,
    SpendStepRepo,
    BudgetCheckRepo,
    FinanceReviewRepo,
    SpendRequestRepo,
    BudgetCheckService,
    SpendRoutingService,
    SpendStatusService,
    SpendViewService,
    FinanceReviewService,
    SpendBudgetListener,
    RepricingService,
    SpendReadSupport,
    SpendHeadService,
    PlanLineService,
    PlanLineRouteService,
    SpendEntryService,
    SpendBatchRepo,
    SpendBatchService,
    SpendBatchViewService,
    SpendQueueService,
    SupplementRepo,
    SupplementService,
    SpendDecisionRepo,
    SpendDecisionService,
    SpendBatchDecisionService,
    SpendApprovalViewService,
    BudgetInformationRepo,
    BudgetInformationService,
    BudgetInformationViewService,
    DelegatedRequestService,
    GrantQueueRepo,
    GrantQueueService,
    ServiceAccountRequestRepo,
    ServiceAccountRequestService,
    ServiceAccountBoundaryService,
    ReturnRequestRepo,
    ReturnRequestService,
    ReturnRequestQueryService,
    ReturnRevocationHook,
    RenewalRequestRepo,
    RenewalRequestService,
    RenewalApplyService,
    RenewalRequestTrail,
    RenewalHoldReader,
    RequestTimingRepo,
    RequestTimingService,
    CongestionService,
    RequestLineRepo,
    LineDecisionRepo,
    LineAmountRepo,
    SupplementDropRepo,
    GroupSubmissionFactsService,
    GroupRequestService,
    GroupCandidateService,
    GroupLineQueryService,
    GroupResolutionService,
    GroupNeedDecisionService,
    SpendEffectsService,
    GroupSpendRecordService,
    GroupSpendDecisionService,
    GroupGrantService,
    GroupWithdrawalService,
    GroupLineClosureService,
    GroupSupplementService,
  ],
  exports: [RequestsService],
})
export class RequestsModule implements OnModuleInit {
  constructor(
    private readonly licensing: LicensingService,
    private readonly gate: AccessRequestGrantGate,
    private readonly releaseGuard: RequestCommitmentReleaseGuard,
    private readonly budgets: BudgetsService,
    private readonly spendListener: SpendBudgetListener,
    private readonly returnHook: ReturnRevocationHook,
    private readonly renewalHold: RenewalHoldReader,
  ) {}

  /**
   * Tells licensing how to judge a request, and the budgets what to tell the requests that wait on them, so that neither
   * imports this module (ADR-0015, ADR-0016).
   */
  onModuleInit(): void {
    this.licensing.registerGrantRequestGate(this.gate);
    this.budgets.registerChangeListener(this.spendListener);
    this.budgets.registerReleaseGuard(this.releaseGuard);
    // Licensing learns how a returned seat ends and which seats have a renewal waiting, without importing this module.
    this.licensing.registerRevocationHook(this.returnHook, 'RETURN_REQUESTS');
    this.licensing.registerRenewalHold(this.renewalHold);
  }
}
