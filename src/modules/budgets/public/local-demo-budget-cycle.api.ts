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

  /**
   * Seeds idempotent `seat_month_runs` marks (`rows = 0`, `skipDuplicates`) for closed months `1..upToMonth` of `year`
   * before seeded requests run spend checks, matching `runningUncommitted`'s W3-08 formula (`budget-targets.ts`);
   * `demo.budget-reviews` later recalculates real `rows` via `SeatMonthService.chargeMonth`.
   */
  async markClosedSeatMonths(
    tx: DbTx,
    organizationId: string,
    year: number,
    upToMonth: number,
    subscriptionIds: readonly string[],
  ): Promise<number> {
    if (upToMonth < 1 || subscriptionIds.length === 0) return 0;
    const now = new Date();
    const data = subscriptionIds.flatMap((subscriptionId) =>
      Array.from({ length: upToMonth }, (_, index) => ({
        organizationId,
        subscriptionId,
        month: new Date(Date.UTC(year, index, 1)),
        rows: 0,
        completedAt: now,
      })),
    );
    const created = await tx.seatMonthRun.createMany({ data, skipDuplicates: true });

    return created.count;
  }
}
