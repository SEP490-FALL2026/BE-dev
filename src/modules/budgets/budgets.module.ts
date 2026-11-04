import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { BudgetCostCenterUseReader } from './commitment/budget-cost-center-use.listener';
import { BudgetHeadChangeListener } from './proposal/budget-head-change.listener';
import { BudgetSpendingApproverGrantCheck } from './proposal/spending-approver-grant.listener';
import { FiscalYearStartLockReader } from './version/fiscal-year-start-lock.listener';
import { SpendingApproverWaitListener } from './budget/spending-approver-wait.listener';
import { BudgetFactsRepo } from './budget/budget-facts.repo';
import { BudgetNotifierService } from './budget/budget-notifier.service';
import { BudgetProposalsController } from './proposal/budget-proposals.controller';
import { BudgetFactsService } from './budget/budget-facts.service';
import { BudgetYearLockRepo } from './budget/budget-year-lock.repo';
import { BudgetVersionLinesController } from './version/budget-version-lines.controller';
import { BudgetVersionsController } from './version/budget-versions.controller';
import { BudgetViewService } from './budget-view/budget-view.service';
import { BudgetsController } from './budget-view/budgets.controller';
import { BudgetsApi } from './public/budgets.api';
import { BudgetChangeListeners, CommitmentReleaseGuardHook } from './public/budgets.extension-points';
import { BudgetCommitmentsController } from './commitment/budget-commitments.controller';
import { CommitmentRepo } from './budget/commitment.repo';
import { CommitmentService } from './commitment/commitment.service';
import { DecisionRepo } from './budget/decision.repo';
import { LineImportService } from './version/line-import.service';
import { ProposalRepo } from './budget/proposal.repo';
import { ProposalService } from './proposal/proposal.service';
import { ProposalSender } from './proposal/proposal-sender.service';
import { ProposalAttachmentBinder } from './attachment/proposal-attachment-binder.service';
import { ProposalViewService } from './proposal/proposal-view.service';
import { VersionAccessService } from './version/version-access.service';
import { VersionHistoryRepo } from './version/version-history.repo';
import { VersionHistoryService } from './version/version-history.service';
import { VersionHistoryViewService } from './version/version-history-view.service';
import { VersionLineRepo } from './budget/version-line.repo';
import { VersionDecisionJudge } from './version/version-decision-judge.service';
import { VersionDecisionWriter } from './version/version-decision-writer.service';
import { VersionDecisionService } from './version/version-decision.service';
import { VersionLineMovedNotifier } from './version/version-line-moved.service';
import { VersionLineService } from './version/version-line.service';
import { VersionWindowService } from './version/version-window.service';
import { VersionRepo } from './budget/version.repo';
import { VersionCreationService } from './version/version-creation.service';
import { VersionFigures } from './version/version-figures.service';
import { VersionRevisionService } from './version/version-revision.service';
import { VersionTrail } from './version/version-trail.service';
import { VersionService } from './version/version.service';
import { VersionViewService } from './budget/version-view.service';
import { BudgetYearEndService } from './year-end/year-end.service';
import { BudgetYearEndSweeper } from './year-end/year-end.job';
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

/**
 * The budgets context (C5, ADR-0016): the proposals the heads of department send for a Cost Center and a fiscal year, and
 * the versions of the budget Finance builds from them. It reads the organization (Cost Centers, heads, the day), the
 * finance context (currencies, money), the catalog (that a plan a line names exists), the operating parameters and the notices
 * of the inbox through their facades, and writes nothing of theirs. The controllers live in the module because no other graph needs
 * them yet. The closure of the fiscal year (`BudgetYearEndSweeper`) runs in the API process like the other sweepers. It
 * exports one facade (`BudgetsApi`), what the check of a request reads, and the extension points the requests context binds
 * (`public/budgets.extension-points.ts`: who hears when a budget changes, who says a remainder may go); it never imports them back.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    FinanceModule,
    CatalogModule,
    NotificationsModule,
    OperatingParametersModule,
    ObjectStorageModule,
  ],
  controllers: [
    BudgetProposalsController,
    BudgetVersionsController,
    BudgetVersionLinesController,
    BudgetsController,
    BudgetCommitmentsController,
    BudgetAttachmentUploadsController,
    BudgetAttachmentReadsController,
  ],
  providers: [
    ProposalRepo,
    VersionRepo,
    VersionLineRepo,
    VersionHistoryRepo,
    DecisionRepo,
    CommitmentRepo,
    BudgetYearLockRepo,
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
    VersionRevisionService,
    VersionService,
    VersionLineMovedNotifier,
    VersionLineService,
    VersionWindowService,
    VersionDecisionJudge,
    VersionDecisionWriter,
    VersionDecisionService,
    LineImportService,
    BudgetYearEndService,
    BudgetYearEndSweeper,
    BudgetAttachmentRepo,
    BudgetAttachmentDeclarationService,
    BudgetAttachmentCompletionService,
    BudgetAttachmentRemovalService,
    BudgetAttachmentDiscardService,
    BudgetAttachmentQueryService,
    BudgetAttachmentLinkService,
    BudgetAttachmentExpiryService,
    BudgetAttachmentExpirySweeper,
    BudgetViewService,
    BudgetFactsRepo,
    BudgetChangeListeners,
    CommitmentReleaseGuardHook,
    BudgetCostCenterUseReader,
    BudgetHeadChangeListener,
    BudgetSpendingApproverGrantCheck,
    FiscalYearStartLockReader,
    SpendingApproverWaitListener,
    CommitmentService,
    BudgetsApi,
  ],
  exports: [BudgetsApi, BudgetChangeListeners, CommitmentReleaseGuardHook],
})
export class BudgetsModule {}
