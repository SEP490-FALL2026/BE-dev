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

  /**
   * The approved budget (base and reserve) of a year in each of the Cost Centers, in one statement: a Cost Center with none is absent.
   * For what the spending approver reads of the year after, whatever the number of Cost Centers.
   */
  approvedBudgetsOfYear(costCenterIds: readonly string[], year: number, tx?: DbTx) {
    return this.facts.approvedOfCostCenters(costCenterIds, year, tx);
  }
}
