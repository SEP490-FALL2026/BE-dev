import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { servingMonthlyPriceMinor } from '../running-uncommitted/serving-line-price.policy';

/** The subscriptions in force and the price of a seat of any plan of each. */
export interface BaselinePricing {
  subscriptions: BaselineSubscription[];
  /** The monthly price of a seat of `planId` on the period `subscriptionId`; null when the period has no price for it. */
  priceOf: (subscriptionId: string, planId: string) => bigint | null;
}

/** What the baseline reads of the catalog: the subscriptions in force, priced by their lines, and the `KPI-3` of the plans. */
@Injectable()
export class BaselineCatalogFacts {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly periods: SubscriptionPeriodApi,
  ) {}

  /**
   * Every active subscription of the company with the monthly price of the plan it stands for read from the line of the period that serves
   * it: the price columns of a period that has lines are only a record (a line is edited through the line), so they price the period only
   * when it has no line. `priceOf` prices a seat of any plan of a period the same way, so a period with several plans charges each seat the
   * line of its own plan.
   */
  async subscriptions(tx?: DbTx): Promise<BaselinePricing> {
    const subscriptions = await this.catalog.getBaselineSubscriptions(tx);
    const linesOf = await this.periods.linesOfSubscriptions(
      subscriptions.map((one) => one.subscriptionId),
      tx,
    );
    const periodPrice = new Map(subscriptions.map((one) => [one.subscriptionId, one.monthlyPriceMinor]));
    const priceOf = (subscriptionId: string, planId: string): bigint | null =>
      servingMonthlyPriceMinor(linesOf.get(subscriptionId) ?? [], planId, periodPrice.get(subscriptionId) ?? null);

    return {
      subscriptions: subscriptions.map((one) => ({
        ...one,
        monthlyPriceMinor: priceOf(one.subscriptionId, one.planId),
      })),
      priceOf,
    };
  }

  /** `KPI-3` in percent by plan, for the plans that have one. */
  kpi3Of(planIds: readonly string[]) {
    return this.catalog.getPlanKpi3(planIds);
  }
}
