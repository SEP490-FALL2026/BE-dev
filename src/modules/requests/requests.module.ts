import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CatalogModule } from '../catalog/catalog.module';
import { LicensingModule } from '../licensing/licensing.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccessRequestGrantGate } from './access-request/grant/access-request-grant.listener';
import { DelegatedRequestService } from './delegated-request/delegated-request.service';
import { DelegatedRequestsController } from './delegated-request/delegated-requests.controller';
import { GrantQueueRepo } from './delegated-request/grant-queue.repo';
import { GrantQueueService } from './delegated-request/grant-queue.service';
import { RequestCommitmentReleaseGuard } from './spend/commitment-release.listener';
import { RequestDraftService } from './draft/request-draft.service';
import { RequestDraftSubmitService } from './draft/request-draft-submit.service';
import { RequestDraftsController } from './draft/request-drafts.controller';
import { RequestOutcomeListeners } from './public/requests.extension-points';
import { RequestOutcomeService } from './outcome/request-outcome.service';
import { AssessmentRepo } from './assessment/assessment.repo';
import { AssessmentService } from './assessment/assessment.service';
import { AssessmentViewService } from './assessment/assessment-view.service';
import { AssessmentStepRepo } from './access-request/assessment-step.repo';
import { CatalogLinkService } from './assessment/catalog-link.service';
import { QuoteService } from './assessment/quote.service';
import { InternalRegistrationService } from './assessment/internal-registration.service';
import { ProposalService } from './assessment/proposal.service';
import { ProposalsController } from './assessment/proposals.controller';
import { AccessRequestQueryService } from './access-request/access-request-query.service';
import { AccessRequestRepo } from './access-request/access-request.repo';
import { AccessRequestService } from './request-submission/access-request.service';
import { AccessRequestsController } from './request-submission/access-requests.controller';
import { NeedDecisionService } from './need-decision/need-decision.service';
import { NeedSpendService } from './need-decision/need-spend.service';
import { WithdrawalService } from './withdraw/withdrawal.service';
import { CancellationController } from './cancellation/cancellation.controller';
import { DepartureCancellationService } from './cancellation/departure-cancellation.service';
import { OpenRequestRepo } from './access-request/open-request/open-request.repo';
import { OpenRequestService } from './access-request/open-request/open-request.service';
import { CostCenterOpenRequestsReader } from './access-request/open-request/cost-center-open-requests.listener';
import { DepartmentOpenRequestsReader } from './access-request/open-request/department-open-requests.listener';
import { RequestUseRepo } from './access-request/open-request/request-use.repo';
import { RequestEndService } from './access-request/request-end.service';
import { RequestsApi } from './public/requests.api';
import { PricingViewService } from './access-request/pricing-view.service';
import { RequestAssessmentService } from './access-request/request-assessment.service';
import { RequestPreviewService } from './request-submission/request-preview.service';
import { SimilarSeatsService } from './need-decision/similar-seats.service';
import { GroupCandidateService } from './group-request-submission/group-candidate.service';
import { GroupGrantService } from './group-request/group-grant.service';
import { GroupLineQueryService } from './group-request/lines/group-line-query.service';
import { GroupLineClosureController } from './line-closure/group-line-closure.controller';
import { GroupLineClosureService } from './line-closure/group-line-closure.service';
import { GroupLinesController } from './group-request/lines/group-lines.controller';
import { GroupNeedDecisionService } from './group-request/lines/group-need-decision.service';
import { GroupRequestService } from './group-request-submission/group-request.service';
import { GroupRequestsController } from './group-request-submission/group-requests.controller';
import { GroupResolutionService } from './group-request/group-resolution.service';
import { GroupSpendDecisionService } from './group-request/lines/group-spend-decision.service';
import { GroupSpendRecordService } from './group-request/lines/group-spend-record.service';
import { GroupSupplementService } from './group-request/group-supplement.service';
import { GroupSubmissionFactsService } from './group-request-submission/group-submission-facts.service';
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
import { FinanceReviewService } from './finance-review/finance-review.service';
import { FinanceReviewsController } from './finance-review/finance-reviews.controller';
import { PlanLineRouteService } from './spend-submission/plan-line-route.service';
import { PlanLineService } from './spend-submission/plan-line.service';
import { BudgetInformationController } from './budget-information/budget-information.controller';
import { BudgetInformationRepo } from './budget-information/budget-information.repo';
import { BudgetInformationService } from './budget-information/budget-information.service';
import { BudgetInformationViewService } from './budget-information/budget-information-view.service';
import { SpendApprovalViewService } from './spend-approval/spend-approval-view.service';
import { SpendApprovalsController } from './spend-approval/spend-approvals.controller';
import { SpendBatchDecisionService } from './spend-approval/spend-batch-decision.service';
import { SpendBatchRepo } from './spend/spend-batch.repo';
import { SpendDecisionRepo } from './spend/spend-decision.repo';
import { SpendDecisionService } from './spend-approval/spend-decision.service';
import { SpendBatchService } from './spend-submission/spend-batch.service';
import { SpendBatchViewService } from './spend-submission/spend-batch-view.service';
import { SpendEffectsService } from './spend/spend-effects.service';
import { SpendEntryService } from './spend/spend-entry.service';
import { SpendHeadService } from './spend-submission/spend-head.service';
import { SpendQueueService } from './spend-submission/spend-queue.service';
import { SpendReadSupport } from './spend/spend-read.service';
import { SpendSubmissionController } from './spend-submission/spend-submission.controller';
import { SupplementRepo } from './spend-submission/supplement.repo';
import { SupplementService } from './spend-submission/supplement.service';
import { RepricingService } from './assessment/repricing.service';
import { SpendBudgetListener } from './finance-review/spend-budget.listener';
import { SpendRequestRepo } from './spend/spend-request.repo';
import { SpendRoutingService } from './spend/spend-routing.service';
import { SpendStatusService } from './spend/spend-status.service';
import { SpendStepRepo } from './spend/spend-step.repo';
import { SpendViewService } from './finance-review/spend-view.service';
import { RenewalApplyService } from './renewal-request/renewal-apply.service';
import { RenewalHoldReader } from './renewal-request/renewal-hold.listener';
import { RenewalRequestRepo } from './renewal-request/renewal-request.repo';
import { RenewalRequestTrail } from './renewal-request/renewal-request-trail.service';
import { RenewalRequestService } from './renewal-request/renewal-request.service';
import { RenewalRequestsController } from './renewal-request/renewal-requests.controller';
import { ReturnRequestQueryService } from './return-request/return-request-query.service';
import { ReturnRequestRepo } from './return-request/return-request.repo';
import { ReturnRequestService } from './return-request/return-request.service';
import { ReturnRequestsController } from './return-request/return-requests.controller';
import { ReturnRevocationHook } from './return-request/return-revocation.listener';
import { RequestTimingRepo } from './timing/request-timing.repo';
import { RequestTimingService } from './timing/request-timing.service';
import { RequestTimingsController } from './timing/request-timings.controller';
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
 * It exports its facade `RequestsApi`, which gives the personnel context the requests of a person who leaves that are still open,
 * and the extension point `RequestOutcomeListeners` (F43) the personnel context listens to.
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
    // The listeners of the outcome of a request (F43), the extension point this module opens, and the service that tells them.
    RequestOutcomeListeners,
    RequestOutcomeService,
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
    RequestsApi,
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
  exports: [RequestsApi, RequestOutcomeListeners],
})
export class RequestsModule {}
