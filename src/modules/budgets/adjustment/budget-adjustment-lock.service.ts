import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetCycleNotOpenError } from '../budget/budget.errors';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { cycleStateOf } from '../cycle/cycle.policy';
import { CycleRepo, type CycleRecord } from '../cycle/cycle.repo';
import { BudgetAdjustmentCycleNotLockedError } from './budget-adjustment.errors';

/**
 * The locks an adjustment takes, in the order of the module (`D11`): the cycle of the year first, `FOR UPDATE`, so that two adjustments of the year, and a version sent in the
 * year, take turns and read the figures one after the other (what is not allocated is a total over the whole year); then the budget year of each Cost Center the adjustment
 * names, the lower id first, so that two transfers between the same two Cost Centers never wait for each other in a circle. The cycle must be locked (`FIX-AD1` AD1-01): a draft
 * cycle has no budget to adjust (`BUDGET_CYCLE.NOT_OPEN`), and one that still takes proposals has no budget made yet (the versions are built from the proposals, and an adjustment
 * made then would stand in the place of a version, `QĐ-103i` B6, `BUDGET_ADJUSTMENT.CYCLE_NOT_LOCKED`); a locked cycle is never opened again, so what is asked once can be decided.
 */
@Injectable()
export class BudgetAdjustmentLockService {
  constructor(
    private readonly cycles: CycleRepo,
    private readonly yearLock: BudgetYearLockRepo,
  ) {}

  /** Throws BudgetCycleNotOpenError and BudgetAdjustmentCycleNotLockedError. */
  async lock(
    tx: DbTx,
    organizationId: string,
    year: number,
    costCenterIds: readonly (string | null)[],
    today: BusinessDate,
  ): Promise<CycleRecord> {
    const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
    const state = cycle ? cycleStateOf(cycle, today) : 'DRAFT';
    if (!cycle || state === 'DRAFT') throw new BudgetCycleNotOpenError(year);
    if (state === 'OPEN') throw new BudgetAdjustmentCycleNotLockedError(year, cycle.submissionDeadline);
    const ids = [...new Set(costCenterIds.filter((id): id is string => id !== null))].sort();
    for (const id of ids) await this.yearLock.lock(tx, id, [year]);

    return cycle;
  }
}
