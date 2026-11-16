import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { CycleRepo } from '../cycle/cycle.repo';
import { SeatMonthPoolService } from '../seat-month/seat-month-pool.service';
import { sharedPoolOverReserve } from './budget-review.policy';

/** The line of the shared pool of a year up to a month, with the reserve and the ceiling of its budget cycle. */
export interface SharedPoolFigures {
  unallocatedMinor: bigint;
  reserveMinor: bigint | null;
  annualCeilingMinor: bigint | null;
  overReserve: boolean | null;
}

/**
 * Sets the line "not allocated, shared pool" of a year against the reserve the budget cycle keeps for the shared pool, and warns Finance when it is above
 * (`QĐ-104i`, `MG-03`, `SM-1-O1`): once for each month it is above, whoever notices first (the close of a month, or the hourly pass), because the notice carries
 * its event key. It only tells; no budget, version or request is changed.
 */
@Injectable()
export class BudgetReviewPoolWatchService {
  constructor(
    private readonly pool: SeatMonthPoolService,
    private readonly cycles: CycleRepo,
    private readonly facts: BudgetFactsService,
    private readonly notifications: NotificationsApi,
  ) {}

  /** The line of the pool of `year` summed to `throughMonth` (months that have ended only), against the cycle of the year. Read outside any transaction. */
  async figuresOf(organizationId: string, year: number, throughMonth: number): Promise<SharedPoolFigures> {
    const [unallocatedMinor, cycle] = await Promise.all([
      this.pool.yearLineMinor(year, undefined, throughMonth),
      this.cycles.findByYear(organizationId, year),
    ]);
    const reserveMinor = cycle?.sharedPoolReserveMinor ?? null;

    return {
      unallocatedMinor,
      reserveMinor,
      annualCeilingMinor: cycle?.annualCeilingMinor ?? null,
      overReserve: sharedPoolOverReserve(unallocatedMinor, reserveMinor),
    };
  }

  /** Tells Finance the pool is above its reserve at `throughMonth`; true when the notice is new, false when there is nothing to tell or it was told. */
  async tellFinance(
    tx: DbTx,
    organizationId: string,
    year: number,
    throughMonth: number,
    figures: SharedPoolFigures,
  ): Promise<boolean> {
    if (figures.overReserve !== true) return false;
    const finance = await this.facts.financeEmployeeId(tx);
    if (finance === null) return false;

    return this.notifications.notifyInApp(tx, {
      organizationId,
      recipientEmployeeId: finance,
      code: 'BUDGET_SHARED_POOL_OVER_RESERVE',
      subject: null,
      params: { year, month: throughMonth },
      eventKey: `sharedPoolOverReserve:${year}-${String(throughMonth).padStart(2, '0')}`,
    });
  }
}
