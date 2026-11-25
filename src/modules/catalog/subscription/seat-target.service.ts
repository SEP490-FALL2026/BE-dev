import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SeatTarget, SeatTargetRef } from '../public/catalog.types';
import { PlanFactsService, type LockedPlan as PlanLookup } from '../plan/plan-facts.service';
import { isLineServingOn } from '../subscription-line/subscription-line.policy';
import { SubscriptionLineRepo } from '../subscription-line/subscription-line.repo';
import { SubscriptionLineSeatsService } from '../subscription-line/subscription-line-seats.service';
import type { SubscriptionLineRecord } from '../subscription-line/subscription-line.types';
import { isPricedInDong } from './price/subscription-price.policy';
import { missingData } from './subscription.policy';
import { SubscriptionRepo } from './subscription.repo';
import type { SubscriptionRecord } from './subscription.types';

const ofPlan = (plan: PlanLookup): SeatTarget => ({
  kind: 'PLAN',
  subscriptionId: null,
  subscriptionLineId: null,
  planId: plan.id,
  planName: plan.name,
  applicationId: plan.applicationId,
  applicationName: plan.applicationName,
  applicationKind: plan.applicationKind,
  provisioningType: plan.provisioningType,
  keyBinding: plan.keyBinding,
  referenceCommitmentMonths: plan.referenceCommitmentMonths,
  monthlyUnitPriceMinor: plan.referencePriceMinor ?? null,
  applicationStatus: plan.applicationStatus,
  status: null,
  missing: [],
  purchasedQuantity: null,
  allowsMidTermReduction: false,
});

const ofSubscription = (
  subscription: SubscriptionRecord,
  plan: PlanLookup,
  lineFacts?: { subscriptionLineId: string | null; purchasedQuantity: number | null },
): SeatTarget => {
  const purchasedQuantity = lineFacts ? lineFacts.purchasedQuantity : subscription.purchasedQuantity;

  return {
    ...ofPlan(plan),
    kind: 'SUBSCRIPTION',
    subscriptionId: subscription.id,
    subscriptionLineId: lineFacts?.subscriptionLineId ?? null,
    status: subscription.status,
    missing: missingData({
      kind: subscription.kind,
      planPricingModel: plan.pricingModel,
      quantity: purchasedQuantity,
      startDate: subscription.startDate,
      billingCycle: subscription.billingCycle,
      hasPrice: isPricedInDong(subscription),
    }),
    purchasedQuantity,
    allowsMidTermReduction: subscription.allowsMidTermReduction,
  };
};

/**
 * What the assignments of seats read of the subscriptions and the plans (`US-02-05`): the target of a seat with its
 * kind of provisioning and the seats bought. `find` reads without a lock, for a preview; `lock` holds the period `FOR UPDATE`
 * (tier 6), for K2 the serving line `FOR UPDATE` (tier 6c), and the plan `FOR SHARE` (tier 7).
 */
@Injectable()
export class SeatTargetService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanFactsService,
    private readonly lines: SubscriptionLineRepo,
    private readonly ledger: SubscriptionLineSeatsService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async find(ref: SeatTargetRef, tx?: DbTx): Promise<SeatTarget | null> {
    if (!('subscriptionId' in ref)) {
      const plan = await this.plans.find(ref.planId);

      return plan ? ofPlan(plan) : null;
    }
    const subscription = await this.subscriptions.find(ref.subscriptionId, tx);
    if (!subscription) return null;

    return this.resolveSubscription(subscription, ref.planId, ref.servingOn, false, tx);
  }

  /** The seat targets of many plans in one read, without a lock; a plan that does not exist is absent. */
  async findPlans(planIds: readonly string[], tx?: DbTx): Promise<SeatTarget[]> {
    return (await this.plans.lookups(planIds, tx)).map(ofPlan);
  }

  async lock(tx: DbTx, ref: SeatTargetRef): Promise<SeatTarget | null> {
    if (!('subscriptionId' in ref)) {
      const plan = await this.plans.lockShared(tx, ref.planId);

      return plan ? ofPlan(plan) : null;
    }
    const subscription = await this.subscriptions.lock(tx, ref.subscriptionId);
    if (!subscription) return null;

    return this.resolveSubscription(subscription, ref.planId, ref.servingOn, true, tx);
  }

  private async resolveSubscription(
    subscription: SubscriptionRecord,
    requestedPlanId: string | undefined,
    servingOn: BusinessDate | undefined,
    locked: boolean,
    tx?: DbTx,
  ): Promise<SeatTarget | null> {
    const targetPlanId = requestedPlanId ?? subscription.planId;
    if (subscription.planProvisioningType === 'K1') {
      const plan = locked && tx ? await this.plans.lockShared(tx, targetPlanId) : await this.plans.find(targetPlanId);

      return plan ? ofPlan(plan) : null;
    }
    const lineFacts =
      subscription.planProvisioningType === 'K2'
        ? await this.resolveK2Line(subscription, targetPlanId, servingOn, locked, tx)
        : undefined;
    // Plan lock (tier 7) always comes after period (tier 6) and line (tier 6c).
    const plan = locked && tx ? await this.plans.lockShared(tx, targetPlanId) : await this.plans.find(targetPlanId);

    return plan ? ofSubscription(subscription, plan, lineFacts) : null;
  }

  private async resolveK2Line(
    subscription: SubscriptionRecord,
    planId: string,
    servingOn: BusinessDate | undefined,
    locked: boolean,
    tx?: DbTx,
  ): Promise<{ subscriptionLineId: string | null; purchasedQuantity: number | null }> {
    const line =
      locked && tx
        ? await this.lines.lockByPeriodAndPlan(tx, subscription.id, planId)
        : await this.lines.findOfPlan(subscription.id, planId, tx);
    if (!line) return { subscriptionLineId: null, purchasedQuantity: subscription.purchasedQuantity };

    const day = servingOn ?? (await this.organizationReads.businessToday(new Date(), tx));
    const serving = isLineServingOn(line, day, subscription);
    const seats = await this.seatsForLineOn(line, day, subscription.purchasedQuantity, tx);

    return { subscriptionLineId: serving ? line.id : null, purchasedQuantity: seats };
  }

  private async seatsForLineOn(
    line: SubscriptionLineRecord,
    day: BusinessDate,
    fallbackQuantity: number | null,
    tx?: DbTx,
  ): Promise<number | null> {
    if (line.ledgerOpenedOn !== null && line.ledgerOpenedOn <= day) {
      return this.ledger.seatsOn(line.id, day, tx);
    }

    return fallbackQuantity;
  }
}
