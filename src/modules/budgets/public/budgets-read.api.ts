import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import type { YearBudgetFacts } from './budgets.types';

export interface RunningUncommittedReader {
  ofCostCenterYears(costCenterId: string, years: readonly number[], tx?: DbTx): Promise<Map<number, bigint>>;
}

/** Read-only budget figures for the shared three-outcome check; never grants or releases a commitment. */
@Injectable()
export class BudgetsReadApi {
  private runningUncommitted: RunningUncommittedReader | null = null;

  constructor(private readonly facts: BudgetFactsRepo) {}

  /** Registers the live running-uncommitted reader when `BudgetsModule` initializes in the API graph. */
  registerRunningUncommitted(reader: RunningUncommittedReader): void {
    this.runningUncommitted = reader;
  }

  async yearFacts(costCenterId: string, years: readonly number[], tx?: DbTx): Promise<Map<number, YearBudgetFacts>> {
    const facts = await this.facts.yearFacts(costCenterId, years, tx);
    if (facts.size === 0 || this.runningUncommitted === null) return facts;
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
    tx?: DbTx,
  ): Promise<Map<string, bigint>> {
    const result = new Map<string, bigint>();
    if (costCenterIds.length === 0 || this.runningUncommitted === null) return result;
    for (const costCenterId of new Set(costCenterIds)) {
      const byYear = await this.runningUncommitted.ofCostCenterYears(costCenterId, [year], tx);
      const amount = byYear.get(year) ?? 0n;
      if (amount > 0n) result.set(costCenterId, amount);
    }

    return result;
  }
}
