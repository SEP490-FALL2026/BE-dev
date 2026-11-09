import { RequestFactsService } from './access-request/request-facts.service';
import { PendingSpendListener } from './spend/pending-spend.listener';
import { RequestsRoutingFacadeModule } from './requests-routing-facade.module';
import { RequestsDashboardApi } from './public/requests-dashboard.api';
import { RequestResubmissionService } from './request-intake/request-resubmission.service';
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
import { AccessRequestGrantGate } from './grant/access-request-grant.listener';
import { GrantQueueController } from './grant-queue/grant-queue.controller';
import { GrantQueueRepo } from './grant-queue/grant-queue.repo';
import { GrantQueueService } from './grant-queue/grant-queue.service';
import { AssessmentQueueController } from './assessment-queue/assessment-queue.controller';
import { AssessmentQueueRepo } from './assessment-queue/assessment-queue.repo';
import { AssessmentQueueService } from './assessment-queue/assessment-queue.service';
import { RequestCommitmentReleaseGuard } from './spend/commitment-release.listener';
import { RequestCommitmentFacts } from './spend/commitment-request-facts.listener';
import { RequestDraftService } from './draft/request-draft.service';
import { RequestDraftSubmitService } from './draft/request-draft-submit.service';
import { RequestDraftsController } from './draft/request-drafts.controller';
import { RequestOutcomeListeners } from './public/requests.extension-points';
import { RequestOutcomeService } from './outcome/request-outcome.service';
import { AssessmentRepo } from './assessment/assessment.repo';
import { AssessmentCompletionService } from './assessment/assessment-completion.service';
import { AssessmentGate } from './assessment/assessment-gate.service';
import { AssessmentPatchService } from './assessment/assessment-patch.service';
import { AssessmentPricingService } from './assessment/assessment-pricing.service';
import { AssessmentQueryService } from './assessment/assessment-query.service';
import { AssessmentRejectionService } from './assessment/assessment-rejection.service';
import { AssessmentService } from './assessment/assessment.service';
import { AssessmentViewService } from './assessment/assessment-view.service';
import { AssessmentStepRepo } from './assessment/assessment-step.repo';
import { CatalogLinkService } from './assessment/catalog-link.service';
import { QuoteService } from './assessment/quote.service';
import { InternalRegistrationService } from './assessment/internal-registration.service';
import { ProposalService } from './assessment/proposal.service';
import { ProposalsController } from './proposal-review/proposals.controller';
import { AccessRequestQueryService } from './request-view/access-request-query.service';
import { AccessRequestService } from './request-intake/access-request.service';
import { RequestSenderService } from './request-intake/request-sender.service';
import { AccessRequestsController } from './request-submission/access-requests.controller';
import { NeedDecisionController } from './need-decision/need-decision.controller';
import { NeedDecisionQueueController } from './need-decision-queue/need-decision-queue.controller';
import { NeedDecisionQueueRepo } from './need-decision-queue/need-decision-queue.repo';
import { NeedDecisionQueueService } from './need-decision-queue/need-decision-queue.service';
import { SimilarSeatsController } from './need-decision/similar-seats.controller';
import { WithdrawalController } from './withdraw/withdrawal.controller';
import { NeedDecisionEffects } from './need-decision/need-decision-effects.service';
import { NeedDecisionService } from './need-decision/need-decision.service';
import { WithdrawalPreconditions } from './withdraw/withdrawal-preconditions.service';
import { WithdrawalWriter } from './withdraw/withdrawal-writer.service';
import { WithdrawalService } from './withdraw/withdrawal.service';
import { CancellationController } from './cancellation/cancellation.controller';
import { DepartureCancellationService } from './cancellation/departure-cancellation.service';
import { OpenRequestRepo } from './access-request/open-request/open-request.repo';
import { OpenRequestService } from './access-request/open-request/open-request.service';
import { CostCenterOpenRequestsReader } from './access-request/open-request/cost-center-open-requests.listener';
import { DepartmentOpenRequestsReader } from './access-request/open-request/department-open-requests.listener';
import { RequestUseRepo } from './access-request/open-request/request-use.repo';
import { RequestEndService } from './request-end/request-end.service';
import { RequestsApi } from './public/requests.api';
import { RequestsAiSourceApi } from './public/requests-ai-source.api';
import { PricingViewService } from './request-view/pricing-view.service';
import { RequestPreviewService } from './request-submission/request-preview.service';
import { SimilarSeatsService } from './need-decision/similar-seats.service';
import { GroupCandidateService } from './group-request-submission/group-candidate.service';
import { GroupGrantService } from './group-request/group-grant.service';
import { GroupLineQueryService } from './group-line-decisions/group-line-query.service';
import { GroupLineClosureController } from './line-closure/group-line-closure.controller';
import { GroupLineCloser } from './line-closure/group-line-closer.service';
import { GroupLineClosureService } from './line-closure/group-line-closure.service';
import { GroupLinesController } from './group-line-decisions/group-lines.controller';
import { GroupNeedPreconditions } from './group-line-decisions/group-need-preconditions.service';
import { GroupNeedVerdictWriter } from './group-line-decisions/group-need-verdict-writer.service';
import { GroupNeedDecisionService } from './group-line-decisions/group-need-decision.service';
import { GroupRequestWriter } from './group-request-submission/group-request-writer.service';
import { GroupRequestService } from './group-request-submission/group-request.service';
import { GroupRequestsController } from './group-request-submission/group-requests.controller';
import { GroupResolutionEnding } from './group-request/group-resolution-ending.service';
import { GroupResolutionService } from './group-request/group-resolution.service';
import { GroupSpendDecisionService } from './group-line-decisions/group-spend-decision.service';
import { GroupSpendHold } from './group-line-decisions/group-spend-hold.service';
import { GroupSpendReport } from './group-line-decisions/group-spend-report.service';
import { GroupSpendRecordService } from './group-line-decisions/group-spend-record.service';
import { GroupSupplementService } from './group-request/group-supplement.service';
import { GroupSubmissionFactsService } from './group-request-submission/group-submission-facts.service';
import { GroupLineWithdrawer } from './group-request/group-line-withdrawer.service';
import { GroupWithdrawalAftermath } from './group-request/group-withdrawal-aftermath.service';
import { GroupWithdrawalService } from './group-request/group-withdrawal.service';
import { LineAmountRepo } from './group-request/line-amount.repo';
import { LineDecisionRepo } from './group-request/line-decision.repo';
import { RequestLineRepo } from './group-request/request-line.repo';
import { SupplementDropRepo } from './group-request/supplement-drop.repo';
import { ControlledWaitController } from './reassignment/controlled-wait.controller';
import { CongestionController } from './sla/congestion.controller';
import { CongestionService } from './sla/congestion.service';
import { RequestsWorkFacadeModule } from './requests-work-facade.module';
import { BudgetCheckController } from './budget-check/budget-check.controller';
import { BudgetCheckViewService } from './budget-check/budget-check-view.service';
import { BudgetCheckYearsViewService } from './budget-check/budget-check-years-view.service';
import { ReserveConfirmationRepo } from './reserve-confirmation/reserve-confirmation.repo';
import { ReserveConfirmationService } from './reserve-confirmation/reserve-confirmation.service';
import { SpendApprovalQueueService } from './spend-approval-view/spend-approval-queue.service';
import { SpendApprovalSourcesService } from './spend-approval-view/spend-approval-sources.service';
import { SpendApprovalViewService } from './spend-approval-view/spend-approval-view.service';
import { StepDueOnService } from './spend-approval-view/step-due-on.service';
import { SpendApprovalsController } from './spend-approval/spend-approvals.controller';
import { SpendBatchDecisionService } from './spend-approval/spend-batch-decision.service';
import { SpendBatchRepo } from './spend/spend-batch.repo';
import { SpendDecisionRepo } from './spend/spend-decision.repo';
import { SpendDecisionRecorder } from './spend-approval/spend-decision-recorder.service';
import { SpendDecisionService } from './spend-approval/spend-decision.service';
import { SpendBatchService } from './spend-submission/spend-batch.service';
import { SpendBatchListService } from './spend-submission/spend-batch-list.service';
import { SpendBatchViewService } from './spend-submission/spend-batch-view.service';
import { SpendEffectsService } from './spend-effects/spend-effects.service';
import { SpendHeadService } from './spend-submission/spend-head.service';
import { SpendQueueService } from './spend-submission/spend-queue.service';
import { SpendQueueOutcomeService } from './spend-submission/spend-queue-outcome.service';
import { SpendApprovalSnapshotService } from './spend-approval-view/spend-approval-snapshot.service';
import { SpendWireViewService } from './spend/spend-wire-view.service';
import { SpendSubmissionController } from './spend-submission/spend-submission.controller';
import { SupplementRepo } from './spend-submission/supplement.repo';
import { SupplementPricing } from './spend-submission/supplement-pricing.service';
import { SupplementQueryService } from './spend-submission/supplement-query.service';
import { SupplementRecorder } from './spend-submission/supplement-recorder.service';
import { SupplementService } from './spend-submission/supplement.service';
import { SpendRequestRepo } from './spend/spend-request.repo';
import { SpendStatusService } from './spend/spend-status.service';
import { RenewalApplyService } from './renewal-apply/renewal-apply.service';
import { RenewalHoldReader } from './renewal-request/renewal-hold.listener';
import { RenewalRequestRepo } from './renewal-apply/renewal-request.repo';
import { RenewalRequestTrail } from './renewal-request/renewal-request-trail.service';
import { RenewalSeatFactsService } from './renewal-request/renewal-seat-facts.service';
import { RenewalRequestWriter } from './renewal-request/renewal-request-writer.service';
import { RenewalRequestService } from './renewal-request/renewal-request.service';
import { RenewalRequestsController } from './renewal-request/renewal-requests.controller';
import { ReturnRequestQueryService } from './return-request/return-request-query.service';
import { ReturnRequestRepo } from './return-request/return-request.repo';
import { ReturnHandoverService } from './return-request/return-handover.service';
import { ReturnSeatGate } from './return-request/return-seat-gate.service';
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
import { MyRequestsController } from './my-requests/my-requests.controller';
import { MyRequestsFactsRepo } from './my-requests/my-requests-facts.repo';
import { MyRequestsRepo } from './my-requests/my-requests.repo';
import { MyRequestsService } from './my-requests/my-requests.service';

/**
 * The requests context (C4, ADR-0015): the request for access to software, the people it is for and the steps that decide
 * it. It reads the organization, the approval roles, the catalog and the operating parameters through their facades and
 * writes nothing of theirs. The HTTP controller lives in the module itself because no graph other than the API needs it
 * yet; the part the worker runs (the reassignment of steps when the organization or a role changes) is
 * `RequestsWorkFacadeModule`, which this module imports for who a step is given to and the queue of the steps that wait.
 * It exports its facade `RequestsApi`, which gives the personnel context the requests of a person who leaves that are still open,
 * and the extension point `RequestOutcomeListeners` the personnel context listens to. `RequestsAiSourceApi` gives the summary of the
 * queue of a person the steps that wait for them (`US-15-05`).
 */
@Module({
  imports: [
    RequestsRoutingFacadeModule,
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
    NeedDecisionController,
    WithdrawalController,
    SimilarSeatsController,
    CancellationController,
    ProposalsController,
    BudgetCheckController,
    SpendSubmissionController,
    SpendApprovalsController,
    NeedDecisionQueueController,
    GrantQueueController,
    AssessmentQueueController,
    ServiceAccountRequestsController,
    ReturnRequestsController,
    RenewalRequestsController,
    ControlledWaitController,
    RequestTimingsController,
    CongestionController,
    GroupRequestsController,
    GroupLinesController,
    GroupLineClosureController,
    MyRequestsController,
  ],
  providers: [
    RequestFactsService,
    PendingSpendListener,
    AssessmentRepo,
    AssessmentStepRepo,
    PricingViewService,
    RequestPreviewService,
    AccessRequestService,
    RequestResubmissionService,
    RequestSenderService,
    RequestDraftService,
    RequestDraftSubmitService,
    // The listeners of the outcome of a request, the extension point this module opens, and the service that tells them.
    RequestOutcomeListeners,
    RequestOutcomeService,
    ProposalService,
    QuoteService,
    AssessmentViewService,
    AssessmentGate,
    AssessmentQueryService,
    AssessmentPatchService,
    AssessmentPricingService,
    AssessmentCompletionService,
    AssessmentRejectionService,
    AssessmentService,
    CatalogLinkService,
    InternalRegistrationService,
    AccessRequestQueryService,
    NeedDecisionEffects,
    NeedDecisionService,
    RequestEndService,
    WithdrawalPreconditions,
    WithdrawalWriter,
    WithdrawalService,
    DepartureCancellationService,
    OpenRequestRepo,
    OpenRequestService,
    // What the organization asks before it retires a department or a Cost Center: the requests that are not over.
    RequestUseRepo,
    DepartmentOpenRequestsReader,
    CostCenterOpenRequestsReader,
    RequestsApi,
    SimilarSeatsService,
    AccessRequestGrantGate,
    RequestCommitmentReleaseGuard,
    RequestCommitmentFacts,
    SpendRequestRepo,
    SpendStatusService,
    BudgetCheckViewService,
    BudgetCheckYearsViewService,
    ReserveConfirmationRepo,
    ReserveConfirmationService,
    SpendWireViewService,
    SpendHeadService,
    SpendBatchRepo,
    SpendBatchService,
    SpendBatchViewService,
    SpendBatchListService,
    SpendQueueService,
    SpendQueueOutcomeService,
    SpendApprovalSnapshotService,
    SupplementRepo,
    SupplementPricing,
    SupplementRecorder,
    SupplementQueryService,
    SupplementService,
    SpendDecisionRepo,
    SpendDecisionRecorder,
    SpendDecisionService,
    SpendBatchDecisionService,
    SpendApprovalQueueService,
    SpendApprovalSourcesService,
    SpendApprovalViewService,
    StepDueOnService,
    NeedDecisionQueueRepo,
    NeedDecisionQueueService,
    GrantQueueRepo,
    GrantQueueService,
    AssessmentQueueRepo,
    AssessmentQueueService,
    ServiceAccountRequestRepo,
    ServiceAccountRequestService,
    ServiceAccountBoundaryService,
    ReturnRequestRepo,
    ReturnSeatGate,
    ReturnHandoverService,
    ReturnRequestService,
    ReturnRequestQueryService,
    ReturnRevocationHook,
    RenewalRequestRepo,
    RenewalRequestWriter,
    RenewalSeatFactsService,
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
    GroupRequestWriter,
    GroupRequestService,
    GroupCandidateService,
    GroupLineQueryService,
    GroupResolutionEnding,
    GroupResolutionService,
    GroupNeedPreconditions,
    GroupNeedVerdictWriter,
    GroupNeedDecisionService,
    SpendEffectsService,
    GroupSpendHold,
    GroupSpendReport,
    GroupSpendRecordService,
    GroupSpendDecisionService,
    GroupGrantService,
    GroupLineWithdrawer,
    GroupWithdrawalAftermath,
    GroupWithdrawalService,
    GroupLineCloser,
    GroupLineClosureService,
    GroupSupplementService,
    MyRequestsRepo,
    MyRequestsFactsRepo,
    MyRequestsService,
    RequestsDashboardApi,
    RequestsAiSourceApi,
  ],
  exports: [RequestsApi, RequestOutcomeListeners, RequestsDashboardApi, RequestsAiSourceApi],
})
export class RequestsModule {}
