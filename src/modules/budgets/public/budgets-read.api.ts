import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';

/** Read-only budget figures for the shared three-outcome check; never grants or releases a commitment. */
@Injectable()
export class BudgetsReadApi {
  constructor(private readonly facts: BudgetFactsRepo) {}

  yearFacts(costCenterId: string, years: readonly number[], tx?: DbTx) {
    return this.facts.yearFacts(costCenterId, years, tx);
  }
}
