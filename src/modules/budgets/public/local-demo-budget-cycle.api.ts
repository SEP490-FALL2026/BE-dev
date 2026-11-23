import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CycleRepo } from '../cycle/cycle.repo';

/**
 * Local-only budget cycle deadline window for the demo seed CLI, declared only in `BudgetsLocalSeedFacadeModule`
 * and loaded by the seed graph so `ops:seed` can submit draft versions under a locked cycle and restore the fixture deadline.
 */
@Injectable()
export class LocalDemoBudgetCycleApi {
  constructor(private readonly cycles: CycleRepo) {}

  /**
   * Locks the cycle row for `year`, sets its `submissionDeadline`, and returns the previous deadline (or `null` if absent).
   */
  async setSubmissionDeadline(
    tx: DbTx,
    organizationId: string,
    year: number,
    submissionDeadline: BusinessDate,
  ): Promise<BusinessDate | null> {
    const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
    if (!cycle) return null;
    await this.cycles.update(tx, cycle.id, { submissionDeadline });

    return cycle.submissionDeadline;
  }
}
