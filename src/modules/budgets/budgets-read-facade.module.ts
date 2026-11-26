import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CatalogPricingFacadeModule } from '../catalog/catalog-pricing-facade.module';
import { LicensingSeatMonthFacadeModule } from '../licensing/licensing-seat-month-facade.module';
import { OrganizationModule } from '../organization/organization.module';
import { BudgetFactsRepo } from './budget/budget-facts.repo';
import { BudgetYearLockRepo } from './budget/budget-year-lock.repo';
import { CommitmentRepo } from './budget/commitment.repo';
import { InvoiceRepo } from './budget/invoice.repo';
import { BudgetsReadApi } from './public/budgets-read.api';
import { RunningUncommittedFactsService } from './running-uncommitted/running-uncommitted-facts.service';
import { RunningUncommittedRepo } from './running-uncommitted/running-uncommitted.repo';
import { SharedPoolLineRepo } from './shared-pool-line/shared-pool-line.repo';

/** Budget, commitment, and running-uncommitted facts shared by API and worker without mounting HTTP or lifecycle listeners. */
@Module({
  imports: [DatabaseModule, OrganizationModule, CatalogPricingFacadeModule, LicensingSeatMonthFacadeModule],
  providers: [
    BudgetFactsRepo,
    BudgetYearLockRepo,
    CommitmentRepo,
    InvoiceRepo,
    RunningUncommittedRepo,
    SharedPoolLineRepo,
    RunningUncommittedFactsService,
    BudgetsReadApi,
  ],
  exports: [
    BudgetFactsRepo,
    BudgetYearLockRepo,
    CommitmentRepo,
    InvoiceRepo,
    RunningUncommittedRepo,
    SharedPoolLineRepo,
    RunningUncommittedFactsService,
    BudgetsReadApi,
  ],
})
export class BudgetsReadFacadeModule {}
