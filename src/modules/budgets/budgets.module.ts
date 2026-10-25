import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { BudgetChangeListeners } from './budget/budget-change-listeners';
import { BudgetFactsRepo } from './budget/budget-facts.repo';
import { BudgetProposalsController } from './budget/budget-proposals.controller';
import { BudgetSupportService } from './budget/budget-support.service';
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
import { VersionLineRepo } from './budget/version-line.repo';
import { VersionDecisionService } from './budget/version-decision.service';
import { VersionLineService } from './budget/version-line.service';
import { VersionRepo } from './budget/version.repo';
import { VersionService } from './budget/version.service';
import { VersionViewService } from './budget/version-view.service';

/**
 * The budgets context (C5, ADR-0016): the proposals the heads of department send for a Cost Center and a fiscal year, and
 * the versions of the budget Finance builds from them. It reads the organization (Cost Centers, heads, the day), the
 * finance context (currencies, money) and the operating parameters through their facades, and writes nothing of theirs.
 * The controllers live in the module because no other graph needs them yet. It exports one facade (`BudgetsService`): what the check of a request reads, and the register of the contexts that
 * must hear when a budget changes; it never imports them back.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    FinanceModule,
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
    DecisionRepo,
    CommitmentRepo,
    BudgetSupportService,
    ProposalService,
    VersionViewService,
    VersionService,
    VersionLineService,
    VersionDecisionService,
    LineImportService,
    BudgetViewService,
    BudgetFactsRepo,
    BudgetChangeListeners,
    CommitmentService,
    BudgetsService,
  ],
  exports: [BudgetsService],
})
export class BudgetsModule {}
