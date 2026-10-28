import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { BudgetChangeListeners } from './budget/budget-change-listeners';
import { BudgetCostCenterUseReader } from './budget/budget-cost-center-use.reader';
import { BudgetHeadChangeListener } from './budget/budget-head-change.listener';
import { BudgetFactsRepo } from './budget/budget-facts.repo';
import { BudgetNotifierService } from './budget/budget-notifier.service';
import { BudgetProposalsController } from './budget/budget-proposals.controller';
import { BudgetSupportService } from './budget/budget-support.service';
import { BudgetYearLockRepo } from './budget/budget-year-lock.repo';
import { BudgetVersionLinesController } from './budget/budget-version-lines.controller';
import { BudgetVersionsController } from './budget/budget-versions.controller';
import { BudgetViewService } from './budget/budget-view.service';
import { BudgetsController } from './budget/budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetCommitmentsController } from './budget/budget-commitments.controller';
import { CommitmentRepo } from './budget/commitment.repo';
import { CommitmentService } from './budget/commitment.service';
import { DecisionRepo } from './budget/decision.repo';
import { LineImportService } from './budget/line-import.service';
import { ProposalRepo } from './budget/proposal.repo';
import { ProposalService } from './budget/proposal.service';
import { ProposalViewService } from './budget/proposal-view.service';
import { VersionAccessService } from './budget/version-access.service';
import { VersionHistoryRepo } from './budget/version-history.repo';
import { VersionHistoryService } from './budget/version-history.service';
import { VersionHistoryViewService } from './budget/version-history-view.service';
import { VersionLineRepo } from './budget/version-line.repo';
import { VersionDecisionService } from './budget/version-decision.service';
import { VersionLineService } from './budget/version-line.service';
import { VersionRepo } from './budget/version.repo';
import { VersionService } from './budget/version.service';
import { VersionViewService } from './budget/version-view.service';
import { BudgetYearEndService } from './budget/year-end.service';
import { BudgetYearEndSweeper } from './budget/year-end.sweeper';

/**
 * The budgets context (C5, ADR-0016): the proposals the heads of department send for a Cost Center and a fiscal year, and
 * the versions of the budget Finance builds from them. It reads the organization (Cost Centers, heads, the day), the
 * finance context (currencies, money), the catalog (that a plan a line names exists), the operating parameters and the notices
 * of the inbox through their facades, and writes nothing of theirs. The controllers live in the module because no other graph needs
 * them yet. The closure of the fiscal year (`BudgetYearEndSweeper`) runs in the API process like the other sweepers (P03-D12). It
 * exports one facade (`BudgetsService`): what the check of a request reads, and the register of the contexts that
 * must hear when a budget changes; it never imports them back.
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
  ],
  controllers: [
    BudgetProposalsController,
    BudgetVersionsController,
    BudgetVersionLinesController,
    BudgetsController,
    BudgetCommitmentsController,
  ],
  providers: [
    ProposalRepo,
    VersionRepo,
    VersionLineRepo,
    VersionHistoryRepo,
    DecisionRepo,
    CommitmentRepo,
    BudgetYearLockRepo,
    BudgetSupportService,
    BudgetNotifierService,
    ProposalViewService,
    ProposalService,
    VersionViewService,
    VersionAccessService,
    VersionHistoryService,
    VersionHistoryViewService,
    VersionService,
    VersionLineService,
    VersionDecisionService,
    LineImportService,
    BudgetYearEndService,
    BudgetYearEndSweeper,
    BudgetViewService,
    BudgetFactsRepo,
    BudgetChangeListeners,
    BudgetCostCenterUseReader,
    BudgetHeadChangeListener,
    CommitmentService,
    BudgetsService,
  ],
  exports: [BudgetsService],
})
export class BudgetsModule {}
