import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { Money } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPoolService } from './pool/subscription-pool.service';
import { SubscriptionGrantingRepo } from './subscription-granting.repo';
import { SubscriptionPriceService } from './price/subscription-price.service';
import { SubscriptionRepo } from './subscription.repo';
import type { BaselineSubscription, RuleSubscription, SubscriptionPrice } from '../public/catalog.types';
import type { SubscriptionKind } from './subscription.types';

/** What the rules of another capability need to know of the subscriptions of some plans: their kind and their end. */
@Injectable()
export class SubscriptionFactsService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly pool: SubscriptionPoolService,
    private readonly granting: SubscriptionGrantingRepo,
    private readonly pricing: SubscriptionPriceService,
  ) {}

  /** Buys one more seat on a subscription the caller holds locked (see `CatalogApi.addPoolSeat`). Throws PoolSeatNotAddableError. */
  addSeat(tx: DbTx, actor: AuthenticatedPrincipal, subscriptionId: string): Promise<number> {
    return this.pool.addSeat(tx, actor, subscriptionId);
  }

  /** Every active subscription of the company, for the baseline of the budget: one statement. */
  baselineOf(tx?: DbTx): Promise<BaselineSubscription[]> {
    return this.subscriptions.baselineRows(tx);
  }

  /**
   * What a plan is bought at, from the main subscription of the plan: the newest priced active one; null when it has none
   * (`FR-3.2`, S1-02). It is the plan's price, never a department's. The pricing model (RECURRING or ONE_TIME) determines
   * how a request counts its amount.
   */
  async priceOfPlan(
    planId: string,
    tx?: DbTx,
    on?: BusinessDate,
  ): Promise<{
    kind: 'RECURRING' | 'ONE_TIME';
    unitPrice: Money;
    /** The unit price converted to the reporting currency when it was recorded (`M-17`); null when it was not converted. */
    reportingUnitPrice: Money | null;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
    /** The subscription may be cut before its term ends (`QĐ-96f`): a request on it runs to the end of the fiscal year at most. */
    allowsMidTermReduction: boolean;
  } | null> {
    return this.pricing.priceOfPlan(planId, tx, on);
  }

  /** The subscriptions of a plan a seat can be taken from today (the shared pool of the plan). */
  grantableOfPlan(planId: string, today: BusinessDate, tx?: DbTx) {
    return this.subscriptions.findGrantableOfPlan(planId, today, tx);
  }

  /** The subscriptions a seat can be taken from today for many plans, in one read, by plan, each in the order a grant takes them. */
  grantableOfPlans(planIds: readonly string[], today: BusinessDate, tx?: DbTx) {
    return this.subscriptions.findGrantableOfPlans(planIds, today, tx);
  }

  /**
   * What this one subscription is bought at, with the price converted to the reporting currency when it was recorded; null when it does
   * not exist or has no price yet. A perpetual purchase has a price and no billing cycle (`QĐ-106d`): its cycle reads `OTHER`.
   */
  async priceOfSubscription(subscriptionId: string, tx?: DbTx): Promise<SubscriptionPrice | null> {
    const record = await this.subscriptions.find(subscriptionId, tx);
    if (!record?.unitPrice) return null;
    const perpetual = record.kind === 'PERPETUAL';
    if (!perpetual && !record.billingCycle) return null;

    return {
      kind: perpetual ? 'ONE_TIME' : 'RECURRING',
      unitPrice: { amountMinor: record.unitPrice.amountMinor, currency: record.unitPrice.currency },
      reportingUnitPrice: record.priceSnapshot && {
        amountMinor: record.priceSnapshot.reportingMinor,
        currency: record.priceSnapshot.reportingCurrency,
      },
      billingCycle: record.billingCycle ?? 'OTHER',
    };
  }

  /**
   * For each of these plans that has a price, the billing cycle of the subscription `priceOfPlan` would use, in one read: what
   * tells whether a price exists for a plan without reading or showing the price itself.
   */
  pricedCyclesOfPlans(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<ReadonlyMap<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | 'ONE_TIME'>> {
    return this.subscriptions.findPricedCyclesOfPlans(planIds, tx);
  }

  /** The subscriptions that grant seats on `day` (active, not taken over by a later period that runs, not ended): what the rules of wasted seats judge. One statement. */
  grantingOn(day: BusinessDate, tx?: DbTx): Promise<RuleSubscription[]> {
    return this.granting.grantingOn(day, tx);
  }

  /** The IT Admin named responsible for the subscription; null when it names none or does not exist. */
  async responsibleItAdminOf(subscriptionId: string, tx?: DbTx): Promise<string | null> {
    return (await this.subscriptions.find(subscriptionId, tx))?.responsibleItAdminEmployeeId ?? null;
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
