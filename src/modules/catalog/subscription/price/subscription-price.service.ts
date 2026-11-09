import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SubscriptionRepo } from '../subscription.repo';

/** The price source shared by request preview, repricing and worker routing; it never loads contracts or storage. */
@Injectable()
export class SubscriptionPriceService {
  constructor(private readonly subscriptions: SubscriptionRepo) {}

  async priceOfPlan(planId: string, tx?: DbTx) {
    const priced = await this.subscriptions.findPricedOfPlan(planId, tx);
    return (
      priced && {
        kind: priced.subscriptionKind === 'PERPETUAL' ? ('ONE_TIME' as const) : ('RECURRING' as const),
        unitPrice: { amountMinor: priced.unitPriceMinor, currency: priced.currency },
        billingCycle: priced.billingCycle,
        allowsMidTermReduction: priced.allowsMidTermReduction,
      }
    );
  }
}
