import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CycleRepo } from './cycle/cycle.repo';
import { LocalDemoBudgetCycleApi } from './public/local-demo-budget-cycle.api';

/**
 * The budget cycle window of the demo seed command: adjusts and restores `submissionDeadline` during seeding.
 * Only loaded in the seed CLI graph; never imported by the API, worker, or another command.
 */
@Module({
  imports: [DatabaseModule],
  providers: [CycleRepo, LocalDemoBudgetCycleApi],
  exports: [LocalDemoBudgetCycleApi],
})
export class BudgetsLocalSeedFacadeModule {}
