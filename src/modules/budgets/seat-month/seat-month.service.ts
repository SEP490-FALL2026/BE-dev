import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import { SharedPoolLineRepo } from '../shared-pool-line/shared-pool-line.repo';
import { SeatMonthSubscriptionService } from './seat-month-subscription.service';
import { SeatMonthChargeError } from './seat-month.errors';
import { endedMonthsOf } from './seat-month.policy';
import { SeatMonthRepo } from './seat-month.repo';

/** What charging a month did: the subscriptions it charged, the rows they have now, and how many failed. */
export interface SeatMonthResult {
  subscriptions: number;
  rows: number;
  /** The subscriptions whose charge failed; a month charged on request throws instead, the sweeper tries them again at its next pass. */
  failed: number;
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Charges the seats of the shared pool (`K2`) to the departments of the people who held them, one month at a time (`SM-1`, `QĐ-103k`,
 * `QĐ-111bg`). A month is charged when it has ended; charging it again gives the same rows (the rows of a subscription and a month are replaced
 * together) and applies nothing to a commitment twice. Each subscription is charged in a transaction of its own that also writes its mark for the month
 * (`SeatMonthSubscriptionService`): the sweeper charges the subscriptions that have no mark, so one that fails never costs the others their month
 * (`SM1-03`), while a month charged on request charges every subscription again, which is how a change to the seats after the month is taken in (`QĐ-111ae`).
 */
@Injectable()
export class SeatMonthService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: SeatMonthRepo,
    private readonly licensing: LicensingSeatMonthApi,
    private readonly subscriptions: SeatMonthSubscriptionService,
    private readonly sharedPoolLines: SharedPoolLineRepo,
  ) {}

  /**
   * True when every K2 subscription with seats or existing seat-month rows in `month` has a completed run in `seat_month_runs`
   * (`W3-07` F6(a), Ca I).
   */
  async isMonthSettlingReady(organizationId: string, month: BusinessDate): Promise<boolean> {
    const seatSubs = (await this.licensing.getSeatsOfMonth(month)).map((seat) => seat.subscriptionId);
    const chargedSubs = await this.repo.subscriptionIdsOfMonth(month);
    const needed = new Set([...seatSubs, ...chargedSubs]);
    if (needed.size === 0) return true;
    const completed = new Set(await this.sharedPoolLines.subscriptionIdsWithRunsForMonth(organizationId, month));
    for (const id of needed) {
      if (!completed.has(id)) return false;
    }
    return true;
  }

  /** Charges the subscriptions of every month that has ended that have no mark for it, the earliest month first: what the sweeper does each hour. */
  async chargeEndedMonths(today: BusinessDate, now: Date = new Date()): Promise<SeatMonthResult> {
    const total: SeatMonthResult = { subscriptions: 0, rows: 0, failed: 0 };
    for (const month of endedMonthsOf(today)) {
      const done = await this.charge(month, now, true);
      total.subscriptions += done.subscriptions;
      total.rows += done.rows;
      total.failed += done.failed;
    }

    return total;
  }

  /**
   * Charges one month (the first day of it) for every subscription, each in a transaction of its own; a subscription that fails does not stop the others,
   * and a SeatMonthChargeError (the first failure, with the subscriptions that failed) is thrown after they were all tried. A month already
   * signed is left as it is.
   */
  async chargeMonth(month: BusinessDate, now: Date = new Date()): Promise<SeatMonthResult> {
    const done = await this.charge(month, now, false);
    if (done.firstFailure !== undefined) throw new SeatMonthChargeError(done.failedIds, done.firstFailure);

    return done;
  }

  private async charge(
    month: BusinessDate,
    now: Date,
    onlyMissing: boolean,
  ): Promise<SeatMonthResult & { firstFailure?: Error; failedIds: string[] }> {
    // Outside any transaction this only says which subscriptions to go through; the seats of each are read again in its own transaction, under the lock of
    // its month, and a mark found only then is checked again there (`SeatMonthSubscriptionService`).
    const seatSubscriptionIds = (await this.licensing.getSeatsOfMonth(month)).map((seat) => seat.subscriptionId);
    const marked = onlyMissing ? await this.repo.completedSubscriptionIds(month) : new Set<string>();
    const subscriptionIds = [...new Set([...seatSubscriptionIds, ...(await this.repo.subscriptionIdsOfMonth(month))])]
      .filter((subscriptionId) => !marked.has(subscriptionId))
      .sort(byId);
    const result: SeatMonthResult & { firstFailure?: Error; failedIds: string[] } = {
      subscriptions: 0,
      rows: 0,
      failed: 0,
      failedIds: [],
    };
    for (const subscriptionId of subscriptionIds) {
      try {
        const rows = await this.runner.run((tx) =>
          this.subscriptions.charge(tx, subscriptionId, month, now, onlyMissing),
        );
        // A subscription another pass charged while this one waited for its lock is not counted again.
        if (rows === null) continue;
        result.rows += rows;
        result.subscriptions += 1;
      } catch (error) {
        result.failed += 1;
        result.failedIds.push(subscriptionId);
        result.firstFailure ??= error instanceof Error ? error : new Error(String(error));
      }
    }

    return result;
  }
}
