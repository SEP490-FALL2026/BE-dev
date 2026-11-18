import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SubscriptionRepo } from '../subscription.repo';
import { PlanReferencePriceRepo } from './plan-reference-price.repo';
import { referencePriceSourceOf, type PlanPriceFacts } from './subscription-price.policy';

/** The price source shared by request preview, repricing and worker routing; it never loads contracts or storage. */
@Injectable()
export class SubscriptionPriceService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly references: PlanReferencePriceRepo,
  ) {}

  /**
   * What a plan is bought at, from the main subscription of the plan (`FR-3.2`, S1-02); with `on`, the price of that day (the period that
   * runs on it), else the newest priced one. `reportingUnitPrice` is the price converted when it was recorded (`M-17`). A plan with no subscription
   * that prices it is priced by its reference price when it has one (`QĐ-113a`); `source` says which.
   */
  async priceOfPlan(planId: string, tx?: DbTx, on?: BusinessDate): Promise<PlanPriceFacts | null> {
    const priced = await this.subscriptionPriceOfPlan(planId, tx, on);
    if (priced) return priced;

    // No subscription prices the plan: its own reference price stands in (`QĐ-113a`); none of the two leaves the price missing.
    const reference = await this.references.findOfPlan(planId, tx);

    return (
      reference &&
      referencePriceSourceOf(reference.provisioningType, {
        amountMinor: reference.amountMinor,
        currency: reference.currency,
      })
    );
  }

  /**
   * What a plan is bought at by a subscription alone, never by its reference price (`QĐ-113a`): the price the cost of a seat, the point of an
   * adjustment and the savings of a plan are worked out from. Null when no subscription prices the plan.
   */
  async subscriptionPriceOfPlan(planId: string, tx?: DbTx, on?: BusinessDate): Promise<PlanPriceFacts | null> {
    const priced = await this.subscriptions.findPricedOfPlan(planId, tx, on);
    if (!priced) return null;

    return {
      kind: priced.subscriptionKind === 'PERPETUAL' ? 'ONE_TIME' : 'RECURRING',
      unitPrice: { amountMinor: priced.unitPriceMinor, currency: priced.currency },
      reportingUnitPrice: priced.reporting,
      billingCycle: priced.billingCycle,
      allowsMidTermReduction: priced.allowsMidTermReduction,
      source: 'SUBSCRIPTION',
    };
  }

  /**
   * For each of these plans that has a price, the billing cycle `priceOfPlan` would count it by, in one read: what tells whether a price exists for a
   * plan without reading or showing the price itself. A plan no subscription prices but that has a reference price is counted by the cycle that price
   * stands for (`QĐ-113a`).
   */
  async pricedCyclesOfPlans(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | 'ONE_TIME'>> {
    const cycles = await this.subscriptions.findPricedCyclesOfPlans(planIds, tx);
    const unpriced = planIds.filter((id) => !cycles.has(id));
    for (const [planId, cycle] of await this.references.findCyclesOfPlans(unpriced, tx)) cycles.set(planId, cycle);

    return cycles;
  }

  /**
   * The price the vendor quoted for the main subscription of the plan, in the currency it was quoted in (`FX-1`, `R-44`): what the price of one on a
   * purchase invoice is compared with. Null when the plan has no priced subscription or its subscription kept no original price.
   */
  async originalPriceOfPlan(
    planId: string,
    tx?: DbTx,
    on?: BusinessDate,
  ): Promise<{ amountMinor: bigint; currency: string } | null> {
    const priced = await this.subscriptions.findPricedOfPlan(planId, tx, on);
    const record = priced && (await this.subscriptions.find(priced.subscriptionId, tx));

    return record?.originalPrice ?? null;
  }
}
