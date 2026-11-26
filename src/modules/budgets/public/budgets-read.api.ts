import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import { RunningUncommittedFactsService } from '../running-uncommitted/running-uncommitted-facts.service';
import type { YearBudgetFacts } from './budgets.types';

export interface RunningUncommittedReader {
  ofCostCenterYears(costCenterId: string, years: readonly number[], tx?: DbTx): Promise<Map<number, bigint>>;
  ofYear(
    year: number,
    today?: BusinessDate,
    tx?: DbTx,
    options?: { exceptRequestIds?: readonly string[] },
  ): Promise<Map<string, bigint>>;
}

/** Read-only budget figures for the shared three-outcome check; never grants or releases a commitment. */
@Injectable()
export class BudgetsReadApi {
  constructor(
    private readonly facts: BudgetFactsRepo,
    private readonly runningUncommitted: RunningUncommittedFactsService,
  ) {}

  async yearFacts(costCenterId: string, years: readonly number[], tx?: DbTx): Promise<Map<number, YearBudgetFacts>> {
    const facts = await this.facts.yearFacts(costCenterId, years, tx);
    if (facts.size === 0) return facts;
    const running = await this.runningUncommitted.ofCostCenterYears(costCenterId, [...facts.keys()], tx);
    for (const [year, entry] of facts) {
      facts.set(year, { ...entry, runningUncommittedMinor: running.get(year) ?? 0n });
    }

    return facts;
  }

  /**
   * The approved budget (base and reserve) of a year in each of the Cost Centers, in one statement: a Cost Center with none is absent.
   * For what the spending approver reads of the year after, whatever the number of Cost Centers.
   */
  approvedBudgetsOfYear(costCenterIds: readonly string[], year: number, tx?: DbTx) {
    return this.facts.approvedOfCostCenters(costCenterIds, year, tx);
  }

  /** Running uncommitted minor of `year` per Cost Center id for `costCenterIds`. */
  async runningUncommittedOfYear(
    costCenterIds: readonly string[],
    year: number,
    options?: { exceptRequestIds?: readonly string[] },
    tx?: DbTx,
  ): Promise<Map<string, bigint>> {
    const result = new Map<string, bigint>();
    if (costCenterIds.length === 0) return result;
    const byCostCenter = await this.runningUncommitted.ofYear(year, undefined, tx, options);
    for (const costCenterId of new Set(costCenterIds)) {
      const amount = byCostCenter.get(costCenterId) ?? 0n;
      if (amount > 0n) result.set(costCenterId, amount);
    }

    return result;
  }
}
