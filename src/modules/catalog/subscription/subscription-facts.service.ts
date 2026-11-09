import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { Money } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SubscriptionRepo } from './subscription.repo';
import type { BaselineSubscription, RuleSubscription } from '../public/catalog.types';
import type { SubscriptionKind } from './subscription.types';

/** What the rules of another capability need to know of the subscriptions of some plans: their kind and their end. */
@Injectable()
export class SubscriptionFactsService {
  constructor(private readonly subscriptions: SubscriptionRepo) {}

  /** The active subscriptions these departments own, for the baseline of the budget: one statement for any number of departments. */
  baselineOf(departmentIds: readonly string[], tx?: DbTx): Promise<BaselineSubscription[]> {
    return this.subscriptions.baselineRowsOf(departmentIds, tx);
  }

  /**
   * What a plan is bought at for a department, from the newest priced active subscription that department owns; null when it
   * has none, and never the price of another department's subscription (`FR-3.2`). The pricing model (RECURRING or ONE_TIME)
   * determines how Request calculates amount and schedule.
   */
  async priceOfPlan(
    planId: string,
    ownerDepartmentId: string,
    tx?: DbTx,
  ): Promise<{
    kind: 'RECURRING' | 'ONE_TIME';
    unitPrice: Money;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
    /** The subscription may be cut before its term ends (`QĐ-96f`): a request on it runs to the end of the fiscal year at most. */
    allowsMidTermReduction: boolean;
  } | null> {
    const priced = await this.subscriptions.findPricedOfPlan(planId, ownerDepartmentId, tx);

    return (
      priced && {
        kind: priced.subscriptionKind === 'PERPETUAL' ? 'ONE_TIME' : 'RECURRING',
        unitPrice: { amountMinor: priced.unitPriceMinor, currency: priced.currency },
        billingCycle: priced.billingCycle,
        allowsMidTermReduction: priced.allowsMidTermReduction,
      }
    );
  }

  /**
   * For each of these plans that the department can price, the billing cycle of the subscription `priceOfPlan` would use, in
   * one read: what tells whether a price exists for a plan without reading or showing the price itself.
   */
  pricedCyclesOfPlans(
    planIds: readonly string[],
    ownerDepartmentId: string,
    tx?: DbTx,
  ): Promise<ReadonlyMap<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER'>> {
    return this.subscriptions.findPricedCyclesOfPlans(planIds, ownerDepartmentId, tx);
  }

  /** The subscriptions that grant seats on `day` (active, no later period, not ended): what the rules of wasted seats judge. One statement. */
  grantingOn(day: BusinessDate, tx?: DbTx): Promise<RuleSubscription[]> {
    return this.subscriptions.grantingOn(day, tx);
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
