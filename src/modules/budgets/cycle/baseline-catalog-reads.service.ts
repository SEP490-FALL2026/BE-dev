import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { servingMonthlyPriceMinor } from '../budget/serving-line-price.policy';

/** What the baseline reads of the catalog: the subscriptions in force, priced by their lines, and the `KPI-3` of the plans. */
@Injectable()
export class BaselineCatalogReads {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly periods: SubscriptionPeriodApi,
  ) {}

  /**
   * Every active subscription of the company with the monthly price of the plan it stands for read from the line of the period that serves
   * it: the price columns of a period that has lines are only a record (a line is edited through the line), so they price the period only
   * when it has no line.
   */
  async subscriptions(tx?: DbTx): Promise<BaselineSubscription[]> {
    const subscriptions = await this.catalog.getBaselineSubscriptions(tx);
    const linesOf = await this.periods.linesOfSubscriptions(
      subscriptions.map((one) => one.subscriptionId),
      tx,
    );

    return subscriptions.map((one) => ({
      ...one,
      monthlyPriceMinor: servingMonthlyPriceMinor(
        linesOf.get(one.subscriptionId) ?? [],
        one.planId,
        one.monthlyPriceMinor,
      ),
    }));
  }

  /** `KPI-3` in percent by plan, for the plans that have one. */
  kpi3Of(planIds: readonly string[]) {
    return this.catalog.getPlanKpi3(planIds);
  }
}
