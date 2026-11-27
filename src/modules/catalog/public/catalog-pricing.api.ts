import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SubscriptionPeriodRepo } from '../subscription/period/subscription-period.repo';
import { toSubscriptionPurchaseFacts } from '../subscription/period/subscription-purchase-facts.mapper';
import { PlanReferencePriceRepo } from '../subscription/price/plan-reference-price.repo';
import { CatalogPlanPriceService } from '../subscription/price/catalog-plan-price.service';
import { SubscriptionRepo } from '../subscription/subscription.repo';
import { SubscriptionLineRepo } from '../subscription-line/subscription-line.repo';
import type { SubscriptionPurchaseFacts } from './subscription-period.types';

/** Read-only catalog contract for pricing and seat-month reads in the API or worker. */
@Injectable()
export class CatalogPricingApi {
  constructor(
    private readonly prices: CatalogPlanPriceService,
    private readonly subscriptions: SubscriptionRepo,
    private readonly periods: SubscriptionPeriodRepo,
    private readonly references: PlanReferencePriceRepo,
    private readonly lines: SubscriptionLineRepo,
  ) {}

  getPlanPrice(planId: string, tx?: DbTx, on?: BusinessDate) {
    return this.prices.priceOfPlan(planId, tx, on);
  }

  /** Read-only subscription purchase facts sharing the same mapping as `SubscriptionPeriodApi.getPurchaseFacts`. */
  async getPurchaseFacts(subscriptionIds: readonly string[], tx?: DbTx): Promise<SubscriptionPurchaseFacts[]> {
    const records = await this.subscriptions.findMany(subscriptionIds, tx);
    const successors = await this.periods.successorPoolFactsOf(
      records.map((record) => record.id),
      tx,
    );

    return records.map((record) => toSubscriptionPurchaseFacts(record, successors.get(record.id)));
  }

  /** Read-only lines of each subscription (every state, oldest first), by subscription id: a seat is priced by the line that serves its plan. */
  linesOfSubscriptions(subscriptionIds: readonly string[], tx?: DbTx) {
    return this.lines.ofSubscriptions(subscriptionIds, tx);
  }

  /** Read-only plan provisioning types and reference monthly prices for seat-month filtering. */
  findPlanSeatTargets(planIds: readonly string[], tx?: DbTx) {
    return this.references.findPlanSeatTargets(planIds, tx);
  }
}
