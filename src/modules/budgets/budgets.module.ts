import { BudgetsReadFacadeModule } from './budgets-read-facade.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FinanceModule } from '../finance/finance.module';
import { LicensingModule } from '../licensing/licensing.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { BudgetCostCenterUseReader } from './commitment/budget-cost-center-use.listener';
import { BudgetHeadChangeListener } from './proposal/budget-head-change.listener';
import { BudgetSpendingApproverGrantCheck } from './proposal/spending-approver-grant.listener';
import { SpendingApproverWaitListener } from './version/spending-approver-wait.listener';
import { BudgetNotifierService } from './budget/budget-notifier.service';
import { BudgetProposalsController } from './proposal/budget-proposals.controller';
import { BudgetFactsService } from './budget/budget-facts.service';
import { BudgetVersionsController } from './version/budget-versions.controller';
import { BudgetViewRepo } from './budget-view/budget-view.repo';
import { BudgetViewNumbersService } from './budget-view/budget-view-numbers.service';
import { BudgetTableViewService } from './budget-view/budget-table-view.service';
import { BudgetViewService } from './budget-view/budget-view.service';
import { BudgetsController } from './budget-view/budgets.controller';
import { BudgetsApi } from './public/budgets.api';
import { BaselineFlags } from './cycle/baseline-flags.service';
import {
  CommitmentReleaseGuardHook,
  CommitmentRequestFactsHook,
  CarriedOverContributions,
  PendingSpendContributions,
  PurchaseInvoiceFactsHook,
} from './public/budgets.extension-points';
import { BudgetCommitmentsController } from './commitment/budget-commitments.controller';
import { CommitmentService } from './commitment/commitment.service';
import { BudgetInvoicesController } from './invoice/budget-invoices.controller';
import { BudgetCyclesController } from './cycle/budget-cycles.controller';
import { BaselineService } from './cycle/baseline.service';
import { CycleDeadlineSweeper } from './cycle/cycle-deadline.job';
import { CycleDeadlineService } from './cycle/cycle-deadline.service';
import { CycleRepo } from './cycle/cycle.repo';
import { PackageService } from './cycle/package.service';
import { CycleService } from './cycle/cycle.service';
import { DepartmentCreationWindowListener } from './cycle/department-creation-window.listener';
import { InvoiceService } from './invoice/invoice.service';
import { OutOfProcessSpendRecorderService } from './invoice/out-of-process-spend-recorder.service';
import { PurchaseInvoiceRecorderService } from './invoice/purchase-invoice-recorder.service';
import { DecisionRepo } from './budget/decision.repo';
import { ProposalRepo } from './budget/proposal.repo';
import { ProposalService } from './proposal/proposal.service';
import { ProposalSender } from './proposal/proposal-sender.service';
import { ProposalAttachmentBinder } from './attachment/proposal-attachment-binder.service';
import { ProposalViewService } from './proposal/proposal-view.service';
import { VersionAccessService } from './version/version-access.service';
import { VersionHistoryRepo } from './version/version-history.repo';
import { VersionHistoryService } from './version/version-history.service';
import { VersionHistoryViewService } from './version/version-history-view.service';
import { VersionDecisionJudge } from './version/version-decision-judge.service';
import { VersionDecisionWriter } from './version/version-decision-writer.service';
import { VersionDecisionService } from './version/version-decision.service';
import { VersionRepo } from './budget/version.repo';
import { VersionBaselineCreationService } from './version/version-baseline-creation.service';
import { VersionCreationService } from './version/version-creation.service';
import { VersionFigures } from './version/version-figures.service';
import { VersionTrail } from './version/version-trail.service';
import { VersionService } from './version/version.service';
import { VersionViewService } from './budget/version-view.service';
import { BudgetYearEndService } from './year-end/year-end.service';
import { BudgetYearEndSweeper } from './year-end/year-end.job';
import { NextYearReminderService } from './year-end/next-year-reminder.service';
import { NextYearReminderSweeper } from './year-end/next-year-reminder.job';
import { BudgetAttachmentUploadsController } from './attachment/budget-attachment-uploads.controller';
import { BudgetAttachmentReadsController } from './attachment/budget-attachment-reads.controller';
import { BudgetAttachmentRepo } from './attachment/budget-attachment.repo';
import { BudgetAttachmentDeclarationService } from './attachment/budget-attachment-declaration.service';
import { BudgetAttachmentCompletionService } from './attachment/budget-attachment-completion.service';
import { BudgetAttachmentRemovalService } from './attachment/budget-attachment-removal.service';
import { BudgetAttachmentDiscardService } from './attachment/budget-attachment-discard.service';
import { BudgetAttachmentQueryService } from './attachment/budget-attachment-query.service';
import { BudgetAttachmentLinkService } from './attachment/budget-attachment-link.service';
import { BudgetAttachmentExpiryService } from './attachment/budget-attachment-expiry.service';
import { BudgetAttachmentExpirySweeper } from './attachment/budget-attachment-expiry.job';
import { SeatMonthRepo } from './seat-month/seat-month.repo';
import { BudgetAdjustmentApplyService } from './adjustment/budget-adjustment-apply.service';
import { BudgetAdjustmentController } from './adjustment/budget-adjustment.controller';
import { BudgetAdjustmentCreateService } from './adjustment/budget-adjustment-create.service';
import { BudgetAdjustmentDecisionService } from './adjustment/budget-adjustment-decision.service';
import { BudgetAdjustmentJudgeService } from './adjustment/budget-adjustment-judge.service';
import { BudgetAdjustmentLockService } from './adjustment/budget-adjustment-lock.service';
import { BudgetAdjustmentNotifierService } from './adjustment/budget-adjustment-notifier.service';
import { BudgetAdjustmentQueryService } from './adjustment/budget-adjustment-query.service';
import { VersionAdjustmentCreationService } from './version/version-adjustment-creation.service';
import { BudgetAdjustmentRepo } from './adjustment/budget-adjustment.repo';
import { BudgetReviewRepo } from './review/budget-review.repo';
import { BudgetReviewController } from './review/budget-review.controller';
import { BudgetReviewFiguresService } from './review/budget-review-figures.service';
import { BudgetReviewPoolWatchService } from './review/budget-review-pool-watch.service';
import { BudgetReviewPriceService } from './review/budget-review-price.service';
import { BudgetReviewQueryService } from './review/budget-review-query.service';
import { BudgetReviewSnapshotService } from './review/budget-review-snapshot.service';
import { BudgetReviewSignatureService } from './review/budget-review-signature.service';
import { BudgetReviewReminderService } from './review/budget-review-reminder.service';
import { BudgetReviewSweeper } from './review/budget-review.job';
import { SeatMonthChargesController } from './seat-month/seat-month-charges.controller';
import { SeatMonthPoolService } from './seat-month/seat-month-pool.service';
import { SeatMonthQueryService } from './seat-month/seat-month-query.service';
import { SeatMonthService } from './seat-month/seat-month.service';
import { SeatMonthSubscriptionService } from './seat-month/seat-month-subscription.service';
import { SeatMonthSweeper } from './seat-month/seat-month.job';
import { PoliciesTemplateFacadeModule } from '../policies/policies-template-facade.module';
import { BudgetProposalTemplateListener } from './proposal/budget-proposal-template.listener';

/**
 * The budgets context (C5, ADR-0016): the proposals the heads of department send for a Cost Center and a fiscal year, and
 * the versions of the budget Finance builds from them. It reads the organization (Cost Centers, heads, the day), the
 * finance context (currencies, money), the catalog (that a plan a line names exists), the operating parameters and the notices
 * of the inbox through their facades, and writes nothing of theirs. The controllers live in the module because no other graph needs
 * them yet. The closure of the fiscal year (`BudgetYearEndSweeper`) and the reminder of the year after (`NextYearReminderSweeper`) run in the API process like the other sweepers. It
 * exports one facade (`BudgetsApi`), what the check of a request reads, and the extension points the requests context binds
 * (`public/budgets.extension-points.ts`: who hears when a budget changes, who says a remainder may go); it never imports them back.
 */
@Module({
  imports: [
    PoliciesTemplateFacadeModule,
    BudgetsReadFacadeModule,
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    FinanceModule,
    CatalogModule,
    LicensingModule,
    NotificationsModule,
    OperatingParametersModule,
    ObjectStorageModule,
  ],
  controllers: [
    BudgetProposalsController,
    BudgetVersionsController,
    BudgetsController,
    BudgetCommitmentsController,
    BudgetInvoicesController,
    BudgetCyclesController,
    BudgetAttachmentUploadsController,
    BudgetAttachmentReadsController,
    SeatMonthChargesController,
    BudgetReviewController,
    BudgetAdjustmentController,
  ],
  providers: [
    BudgetProposalTemplateListener,
    ProposalRepo,
    VersionRepo,
    VersionHistoryRepo,
    DecisionRepo,
    BudgetFactsService,
    BudgetNotifierService,
    ProposalViewService,
    ProposalService,
    ProposalSender,
    ProposalAttachmentBinder,
    VersionViewService,
    VersionAccessService,
    VersionHistoryService,
    VersionHistoryViewService,
    VersionFigures,
    VersionTrail,
    VersionCreationService,
    VersionBaselineCreationService,
    VersionService,
    VersionDecisionJudge,
    VersionDecisionWriter,
    VersionDecisionService,
    BudgetYearEndService,
    BudgetYearEndSweeper,
    NextYearReminderService,
    NextYearReminderSweeper,
    BudgetAttachmentRepo,
    BudgetAttachmentDeclarationService,
    BudgetAttachmentCompletionService,
    BudgetAttachmentRemovalService,
    BudgetAttachmentDiscardService,
    BudgetAttachmentQueryService,
    BudgetAttachmentLinkService,
    BudgetAttachmentExpiryService,
    BudgetAttachmentExpirySweeper,
    BudgetViewRepo,
    BudgetViewNumbersService,
    BudgetTableViewService,
    BudgetViewService,
    CycleRepo,
    CycleService,
    BaselineService,
    PackageService,
    CycleDeadlineService,
    CycleDeadlineSweeper,
    DepartmentCreationWindowListener,
    PendingSpendContributions,
    CarriedOverContributions,
    BaselineFlags,
    SeatMonthRepo,
    BudgetAdjustmentRepo,
    BudgetAdjustmentApplyService,
    BudgetAdjustmentCreateService,
    BudgetAdjustmentDecisionService,
    BudgetAdjustmentJudgeService,
    BudgetAdjustmentLockService,
    BudgetAdjustmentNotifierService,
    BudgetAdjustmentQueryService,
    VersionAdjustmentCreationService,
    BudgetReviewRepo,
    BudgetReviewPriceService,
    BudgetReviewFiguresService,
    BudgetReviewPoolWatchService,
    BudgetReviewQueryService,
    BudgetReviewSnapshotService,
    BudgetReviewSignatureService,
    BudgetReviewReminderService,
    BudgetReviewSweeper,
    SeatMonthSubscriptionService,
    SeatMonthService,
    SeatMonthPoolService,
    SeatMonthQueryService,
    SeatMonthSweeper,
    CommitmentReleaseGuardHook,
    CommitmentRequestFactsHook,
    PurchaseInvoiceFactsHook,
    BudgetCostCenterUseReader,
    BudgetHeadChangeListener,
    BudgetSpendingApproverGrantCheck,
    SpendingApproverWaitListener,
    CommitmentService,
    InvoiceService,
    PurchaseInvoiceRecorderService,
    OutOfProcessSpendRecorderService,
    BudgetsApi,
  ],
  exports: [
    BudgetsApi,
    PendingSpendContributions,
    CarriedOverContributions,
    CommitmentReleaseGuardHook,
    CommitmentRequestFactsHook,
    PurchaseInvoiceFactsHook,
  ],
})
export class BudgetsModule {}
