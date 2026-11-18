import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SubscriptionPriceService } from '../subscription/price/subscription-price.service';

/** Read-only catalog contract for pricing a request in the API or worker. */
@Injectable()
export class CatalogPricingApi {
  constructor(private readonly prices: SubscriptionPriceService) {}

  getPlanPrice(planId: string, tx?: DbTx, on?: BusinessDate) {
    return this.prices.priceOfPlan(planId, tx, on);
  }
}
