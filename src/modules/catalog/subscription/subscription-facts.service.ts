import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPoolService } from './pool/subscription-pool.service';
import { SubscriptionGrantingRepo } from './subscription-granting.repo';
import { monthlyPriceOf, type PlanPriceFacts } from './price/subscription-price.policy';
import { SubscriptionPriceService } from './price/subscription-price.service';
import { SubscriptionRepo } from './subscription.repo';
import type {
  BaselineSubscription,
  RuleSubscription,
  StockPlanFilter,
  StockPlanPage,
  SubscriptionPrice,
} from '../public/catalog.types';
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

  /** Buys one more seat on a subscription the caller holds locked, for the request that asks for it when there is one (see `CatalogApi.addPoolSeat`). Throws PoolSeatNotAddableError. */
  addSeat(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    requestId: string | null = null,
  ): Promise<number> {
    return this.pool.addSeat(tx, actor, subscriptionId, requestId);
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
  async priceOfPlan(planId: string, tx?: DbTx, on?: BusinessDate): Promise<PlanPriceFacts | null> {
    return this.pricing.priceOfPlan(planId, tx, on);
  }

  /** What a plan is bought at by a subscription alone, never by its reference price (`QĐ-113a`): the price for cost, adjustments and savings. */
  async subscriptionPriceOfPlan(planId: string, tx?: DbTx, on?: BusinessDate): Promise<PlanPriceFacts | null> {
    return this.pricing.subscriptionPriceOfPlan(planId, tx, on);
  }

  /** The price the vendor quoted for the main subscription of the plan, in the currency it was quoted in; null when none was kept. */
  originalPriceOfPlan(
    planId: string,
    tx?: DbTx,
    on?: BusinessDate,
  ): Promise<{ amountMinor: bigint; currency: string } | null> {
    return this.pricing.originalPriceOfPlan(planId, tx, on);
  }

  /** The price the vendor quoted for this subscription, in the currency it was quoted in; null when none was kept or it does not exist. */
  async originalPriceOfSubscription(
    subscriptionId: string,
    tx?: DbTx,
  ): Promise<{ amountMinor: bigint; currency: string } | null> {
    return (await this.subscriptions.find(subscriptionId, tx))?.originalPrice ?? null;
  }

  /** The subscriptions of a plan a seat can be taken from today (the shared pool of the plan). */
  grantableOfPlan(planId: string, today: BusinessDate, tx?: DbTx) {
    return this.granting.findGrantableOfPlan(planId, today, tx);
  }

  /** The subscriptions a seat can be taken from today for many plans, in one read, by plan, each in the order a grant takes them. */
  grantableOfPlans(planIds: readonly string[], today: BusinessDate, tx?: DbTx) {
    return this.granting.findGrantableOfPlans(planIds, today, tx);
  }

  /** One page of the plans that give out seats, keys or personal accounts, each with the subscriptions a seat can be taken from today (see `CatalogApi.getStockPlans`). */
  stockPlansPage(filter: StockPlanFilter): Promise<StockPlanPage> {
    return this.granting.pageStockPlans(filter);
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
      monthlyPriceMinor: monthlyPriceOf(record),
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
    return this.pricing.pricedCyclesOfPlans(planIds, tx);
  }

  /** The subscriptions that grant seats on `day` (active, not taken over by a later period that runs, not ended): what the rules of wasted seats judge. One statement. */
  grantingOn(day: BusinessDate, tx?: DbTx): Promise<RuleSubscription[]> {
    return this.granting.grantingOn(day, tx);
  }

  /** The IT Admin named responsible for the subscription; null when it names none or does not exist. */
  async responsibleItAdminOf(subscriptionId: string, tx?: DbTx): Promise<string | null> {
    return (await this.subscriptions.find(subscriptionId, tx))?.responsibleItAdminEmployeeId ?? null;
  }

  /** The subscriptions and perpetual purchases of these plans, oldest first. */
  termsOfPlans(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<{ subscriptionId: string; planId: string; kind: SubscriptionKind; endDate: BusinessDate | null }[]> {
    return this.subscriptions.findOfPlans(planIds, tx);
  }
}
