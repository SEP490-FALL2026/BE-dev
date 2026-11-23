import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CycleRepo } from '../cycle/cycle.repo';

/**
 * Local-only budget cycle deadline move for the demo seed CLI, declared only in `BudgetsLocalSeedFacadeModule` and loaded by the seed graph: the seed
 * moves the submission deadline of a cycle to a day that has passed, for good, so the versions of the dataset are sent to a cycle that is really locked.
 */
@Injectable()
export class LocalDemoBudgetCycleApi {
  constructor(private readonly cycles: CycleRepo) {}

  /**
   * Locks the cycle row for `year`, sets its `submissionDeadline`, and returns the id of the cycle with the deadline it had (or `null` if absent).
   */
  async setSubmissionDeadline(
    tx: DbTx,
    organizationId: string,
    year: number,
    submissionDeadline: BusinessDate,
  ): Promise<{ id: string; previous: BusinessDate } | null> {
    const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
    if (!cycle) return null;
    await this.cycles.update(tx, cycle.id, { submissionDeadline });

    return { id: cycle.id, previous: cycle.submissionDeadline };
  }
}
