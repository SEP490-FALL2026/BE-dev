import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import { SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { servingLineOf, servingMonthlyPriceMinor } from '../running-uncommitted/serving-line-price.policy';

/** The subscriptions in force and what each plan of each is: its price and its seats. */
export interface BaselinePricing {
  subscriptions: BaselineSubscription[];
  /** The monthly price of a seat of `planId` on the period `subscriptionId`; null when the period has no price for it. */
  priceOf: (subscriptionId: string, planId: string) => bigint | null;
  /** The seats the line serving `planId` has today (the seats bought of a period that has no line); null when it has no number of seats. */
  seatsOf: (subscriptionId: string, planId: string) => number | null;
  /** The plans a period serves: one for each plan of its lines that still serve, the plan of the period when it has no line. */
  planIdsOf: (subscriptionId: string) => string[];
}

/** What the baseline reads of the catalog: the subscriptions in force, priced by their lines, and the `KPI-3` of the plans. */
@Injectable()
export class BaselineCatalogFacts {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly periods: SubscriptionPeriodApi,
    private readonly seatLedger: SeatLedgerApi,
  ) {}

  /**
   * Every active subscription of the company with the monthly price of the plan it stands for read from the line of the period that serves
   * it: the price columns of a period that has lines are only a record (a line is edited through the line), so they price the period only
   * when it has no line. `priceOf` and `seatsOf` read a plan of a period the same way, so a period with several plans charges each seat
   * the line of its own plan and counts the idle seats of each plan on the line of that plan.
   */
  async subscriptions(today: BusinessDate, tx?: DbTx): Promise<BaselinePricing> {
    const subscriptions = await this.catalog.getBaselineSubscriptions(tx);
    const linesOf = await this.periods.linesOfSubscriptions(
      subscriptions.map((one) => one.subscriptionId),
      tx,
    );
    const periodOf = new Map(subscriptions.map((one) => [one.subscriptionId, one]));
    const keptOf = (subscriptionId: string) =>
      (linesOf.get(subscriptionId) ?? []).filter((line) => line.closedReason !== 'REMOVED');
    const planIds = new Map(
      subscriptions.map((one) => {
        const kept = keptOf(one.subscriptionId);

        return [one.subscriptionId, kept.length === 0 ? [one.planId] : [...new Set(kept.map((line) => line.planId))]];
      }),
    );
    const planIdsOf = (subscriptionId: string): string[] => planIds.get(subscriptionId) ?? [];
    const priceOf = (subscriptionId: string, planId: string): bigint | null =>
      servingMonthlyPriceMinor(
        linesOf.get(subscriptionId) ?? [],
        planId,
        periodOf.get(subscriptionId)?.monthlyPriceMinor ?? null,
      );
    const servingLines = subscriptions.flatMap((one) =>
      planIdsOf(one.subscriptionId).flatMap((planId) => {
        const serving = servingLineOf(keptOf(one.subscriptionId), planId);

        return serving === null ? [] : [serving];
      }),
    );
    const ledger = await this.seatLedger.seatsOnDays(
      servingLines.map((line) => line.id),
      today,
      today,
      tx,
    );
    const seatsOf = (subscriptionId: string, planId: string): number | null => {
      const kept = keptOf(subscriptionId);
      if (kept.length === 0) {
        const period = periodOf.get(subscriptionId);

        return period?.planId === planId ? period.purchasedQuantity : null;
      }
      const serving = servingLineOf(kept, planId);

      return serving === null ? null : (ledger.get(serving.id)?.get(today) ?? null);
    };

    return {
      subscriptions: subscriptions.map((one) => ({
        ...one,
        monthlyPriceMinor: priceOf(one.subscriptionId, one.planId),
      })),
      priceOf,
      seatsOf,
      planIdsOf,
    };
  }

  /** The name of each of these plans, by id. */
  async planNames(planIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    const summaries = await this.catalog.getPlanSummaries(planIds, tx);

    return new Map(summaries.map((summary) => [summary.planId, summary.planName]));
  }

  /** `KPI-3` in percent by plan, for the plans that have one. */
  kpi3Of(planIds: readonly string[]) {
    return this.catalog.getPlanKpi3(planIds);
  }
}
