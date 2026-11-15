import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import { SeatMonthSubscriptionService } from './seat-month-subscription.service';
import { endedMonthsOf } from './seat-month.policy';
import { SeatMonthRepo } from './seat-month.repo';
import { SeatMonthSignedGuard } from './seat-month.types';

/** What charging a month did: the subscriptions it looked at, the rows they have now, and whether a signed month made it stop. */
export interface SeatMonthResult {
  skipped: boolean;
  subscriptions: number;
  rows: number;
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Charges the seats of the shared pool (`K2`) to the departments of the people who held them, one month at a time (`SM-1`, `QĐ-103k`,
 * `QĐ-111bg`). A month is charged when it has ended; charging it again gives the same rows (the rows of a subscription and a month are replaced
 * together) and applies nothing to a commitment twice, and a month a review period signed is never charged again. Each subscription is charged in
 * a transaction of its own (`SeatMonthSubscriptionService`).
 */
@Injectable()
export class SeatMonthService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: SeatMonthRepo,
    private readonly licensing: LicensingSeatMonthApi,
    private readonly signed: SeatMonthSignedGuard,
    private readonly subscriptions: SeatMonthSubscriptionService,
  ) {}

  /** Charges every month that has ended and has no row yet, the earliest first: what the sweeper does each hour. */
  async chargeEndedMonths(today: BusinessDate, now: Date = new Date()): Promise<SeatMonthResult> {
    const total: SeatMonthResult = { skipped: false, subscriptions: 0, rows: 0 };
    for (const month of endedMonthsOf(today)) {
      if ((await this.repo.countOfMonth(month)) > 0) continue;
      const done = await this.chargeMonth(month, now);
      total.subscriptions += done.subscriptions;
      total.rows += done.rows;
    }

    return total;
  }

  /** Charges one month (the first day of it), each subscription in a transaction of its own. A month already signed is left as it is. */
  async chargeMonth(month: BusinessDate, now: Date = new Date()): Promise<SeatMonthResult> {
    if (await this.signed.isSigned(month)) return { skipped: true, subscriptions: 0, rows: 0 };
    const seatsBySubscription = new Map<string, SeatOfMonth[]>();
    for (const seat of await this.licensing.getSeatsOfMonth(month)) {
      seatsBySubscription.set(seat.subscriptionId, [...(seatsBySubscription.get(seat.subscriptionId) ?? []), seat]);
    }
    const subscriptionIds = [
      ...new Set([...seatsBySubscription.keys(), ...(await this.repo.subscriptionIdsOfMonth(month))]),
    ].sort(byId);
    let rows = 0;
    for (const subscriptionId of subscriptionIds) {
      rows += await this.runner.run((tx) =>
        this.subscriptions.charge(tx, subscriptionId, month, seatsBySubscription.get(subscriptionId) ?? [], now),
      );
    }

    return { skipped: false, subscriptions: subscriptionIds.length, rows };
  }
}
