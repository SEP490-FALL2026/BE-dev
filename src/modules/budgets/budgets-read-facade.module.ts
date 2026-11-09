import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { BudgetFactsRepo } from './budget/budget-facts.repo';
import { BudgetYearLockRepo } from './budget/budget-year-lock.repo';
import { CommitmentRepo } from './budget/commitment.repo';
import { InvoiceRepo } from './budget/invoice.repo';
import { BudgetsReadApi } from './public/budgets-read.api';

/** Budget and commitment facts shared by API and worker without mounting HTTP or lifecycle listeners. */
@Module({
  imports: [DatabaseModule],
  providers: [BudgetFactsRepo, BudgetYearLockRepo, CommitmentRepo, InvoiceRepo, BudgetsReadApi],
  exports: [BudgetFactsRepo, BudgetYearLockRepo, CommitmentRepo, InvoiceRepo, BudgetsReadApi],
})
export class BudgetsReadFacadeModule {}
