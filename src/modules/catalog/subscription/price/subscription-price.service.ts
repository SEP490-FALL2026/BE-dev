import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { DONG } from '../../../../core/money/money';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { LicenseLotStockService } from '../../license-lot/license-lot-stock.service';
import { SubscriptionRepo } from '../subscription.repo';
import { PlanReferencePriceRepo } from './plan-reference-price.repo';
import { referencePriceSourceOf, subscriptionPlanPriceOf, type PlanPriceFacts } from './subscription-price.policy';

/** The price source for catalog reads (`CatalogApi`), including K4 free-lot fallback via `LicenseLotStockService`. */
@Injectable()
export class SubscriptionPriceService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly references: PlanReferencePriceRepo,
    private readonly lotStock: LicenseLotStockService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /**
   * What a plan is bought at, from the main subscription of the plan (`FR-3.2`, S1-02); with `on`, the price of that day (the period that
   * runs on it), else the newest priced one. For K4 (`K-A5`, `QĐ-116am`), reads the plan reference price first, then the unit price of the newest
   * lot with `free > 0` ordered `(purchasedOn DESC, id DESC)`; missing when neither exists.
   */
  async priceOfPlan(planId: string, tx?: DbTx, on?: BusinessDate): Promise<PlanPriceFacts | null> {
    const kind = await this.references.findPlanProvisioningType(planId, tx);
    if (kind === 'K4') return this.priceOfK4Plan(planId, tx);

    const priced = await this.subscriptionPriceOfPlan(planId, tx, on);
    if (priced) return priced;

    // No subscription prices the plan: its own reference price stands in (`QĐ-113a`); none of the two leaves the price missing.
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

  private async priceOfK4Plan(planId: string, tx?: DbTx): Promise<PlanPriceFacts | null> {
    const reference = await this.references.findOfPlan(planId, tx);
    if (reference) {
      return referencePriceSourceOf('K4', { amountMinor: reference.amountMinor, currency: reference.currency }, null);
    }
    const lotPriceMinor = await this.lotStock.newestFreeLotUnitPrice(planId, tx);
    if (lotPriceMinor === null) return null;

    return {
      kind: 'ONE_TIME',
      provisioningType: 'K4',
      referenceCommitmentMonths: null,
      unitPrice: { amountMinor: lotPriceMinor, currency: DONG },
      reportingUnitPrice: { amountMinor: lotPriceMinor, currency: DONG },
      monthlyPriceMinor: null,
      billingCycle: 'OTHER',
      allowsMidTermReduction: false,
      source: 'SUBSCRIPTION',
    };
  }

  /**
   * What a plan is bought at by a subscription alone, never by its reference price (`QĐ-113a`): the price the cost of a seat, the point of an
   * adjustment and the savings of a plan are worked out from. Null when no subscription prices the plan.
   */
  async subscriptionPriceOfPlan(planId: string, tx?: DbTx, on?: BusinessDate): Promise<PlanPriceFacts | null> {
    const priced = await this.subscriptions.findPricedOfPlan(
      planId,
      await this.organizationReads.businessToday(new Date(), tx),
      tx,
      on,
    );
    if (!priced) return null;

    return subscriptionPlanPriceOf(priced);
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
    const cycles = await this.subscriptions.findPricedCyclesOfPlans(
      planIds,
      await this.organizationReads.businessToday(new Date(), tx),
      tx,
    );
    const unpriced = planIds.filter((id) => !cycles.has(id));
    for (const [planId, cycle] of await this.references.findCyclesOfPlans(unpriced, tx)) cycles.set(planId, cycle);
    const stillUnpriced = planIds.filter((id) => !cycles.has(id));
    const k4Ids = await this.references.findK4PlanIds(stillUnpriced, tx);
    for (const planId of await this.lotStock.plansWithFreeLot(k4Ids, tx)) {
      cycles.set(planId, 'ONE_TIME');
    }

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
    const priced = await this.subscriptions.findPricedOfPlan(
      planId,
      await this.organizationReads.businessToday(new Date(), tx),
      tx,
      on,
    );
    const record = priced && (await this.subscriptions.find(priced.subscriptionId, tx));

    return record?.originalPrice ?? null;
  }
}
