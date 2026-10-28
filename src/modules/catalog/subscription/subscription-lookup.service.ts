import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { Money } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SubscriptionRepo } from './subscription.repo';
import type { SubscriptionKind } from './subscription.types';

/** What the rules of another capability need to know of the subscriptions of some plans: their kind and their end. */
@Injectable()
export class SubscriptionLookupService {
  constructor(private readonly subscriptions: SubscriptionRepo) {}

  /**
   * What a plan is bought at for a department, from the newest priced active subscription that department owns; null when it
   * has none, and never the price of another department's subscription (`FR-3.2`, F38).
   */
  async priceOfPlan(
    planId: string,
    ownerDepartmentId: string,
    tx?: DbTx,
  ): Promise<{ unitPrice: Money; billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' } | null> {
    const priced = await this.subscriptions.findPricedOfPlan(planId, ownerDepartmentId, tx);

    return (
      priced && {
        unitPrice: { amountMinor: priced.unitPriceMinor, currency: priced.currency },
        billingCycle: priced.billingCycle,
      }
    );
  }

  /** The ids of every subscription and purchase a department owns, by id (what a rule about the department's work reads). */
  idsOwnedBy(departmentId: string, tx?: DbTx): Promise<string[]> {
    return this.subscriptions.idsOwnedBy(departmentId, tx);
  }

  /** The subscriptions and perpetual purchases of these plans, oldest first. */
  termsOfPlans(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<{ subscriptionId: string; planId: string; kind: SubscriptionKind; endDate: BusinessDate | null }[]> {
    return this.subscriptions.findOfPlans(planIds, tx);
  }
}
