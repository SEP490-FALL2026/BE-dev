import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { Money } from '../../../../core/money/money';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SubscriptionRepo } from '../subscription.repo';

/** The price source shared by request preview, repricing and worker routing; it never loads contracts or storage. */
@Injectable()
export class SubscriptionPriceService {
  constructor(private readonly subscriptions: SubscriptionRepo) {}

  /**
   * What a plan is bought at, from the main subscription of the plan (`FR-3.2`, S1-02); with `on`, the price of that day (the period that
   * runs on it), else the newest priced one. `reportingUnitPrice` is the price converted when it was recorded (`M-17`).
   */
  async priceOfPlan(
    planId: string,
    tx?: DbTx,
    on?: BusinessDate,
  ): Promise<{
    kind: 'RECURRING' | 'ONE_TIME';
    unitPrice: Money;
    reportingUnitPrice: Money | null;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
    /** The subscription may be cut before its term ends (`QĐ-96f`): a request on it runs to the end of the fiscal year at most. */
    allowsMidTermReduction: boolean;
  } | null> {
    const priced = await this.subscriptions.findPricedOfPlan(planId, tx, on);

    return (
      priced && {
        kind: priced.subscriptionKind === 'PERPETUAL' ? 'ONE_TIME' : 'RECURRING',
        unitPrice: { amountMinor: priced.unitPriceMinor, currency: priced.currency },
        reportingUnitPrice: priced.reporting,
        billingCycle: priced.billingCycle,
        allowsMidTermReduction: priced.allowsMidTermReduction,
      }
    );
  }
}
