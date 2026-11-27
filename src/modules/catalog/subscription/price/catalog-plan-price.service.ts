import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SubscriptionRepo } from '../subscription.repo';
import { PlanReferencePriceRepo } from './plan-reference-price.repo';
import { referencePriceSourceOf, subscriptionPlanPriceOf, type PlanPriceFacts } from './subscription-price.policy';

/**
 * Read-only subscription and plan-reference price lookup for the worker / facade graphs (no lot-stock hook dependency).
 * API callers in `CatalogModule` use `SubscriptionPriceService`, which adds K4 free-lot fallback via `LicenseLotStockService`.
 */
@Injectable()
export class CatalogPlanPriceService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly references: PlanReferencePriceRepo,
  ) {}

  async priceOfPlan(planId: string, tx?: DbTx, on?: BusinessDate): Promise<PlanPriceFacts | null> {
    const priced = await this.subscriptions.findPricedOfPlan(planId, tx, on);
    if (priced) return subscriptionPlanPriceOf(priced);

    const reference = await this.references.findOfPlan(planId, tx);

    return (
      reference &&
      referencePriceSourceOf(
        reference.provisioningType,
        {
          amountMinor: reference.amountMinor,
          currency: reference.currency,
        },
        reference.referenceCommitmentMonths,
      )
    );
  }
}
