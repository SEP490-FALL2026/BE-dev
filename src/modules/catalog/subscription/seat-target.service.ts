import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SeatTarget, SeatTargetRef } from '../catalog.types';
import { PlanLookupService } from '../plan/plan-lookup.service';
import type { LockedPlan as PlanLookup } from '../plan/plan-lookup.service';
import { missingData } from './subscription.policy';
import { SubscriptionRepo } from './subscription.repo';
import type { SubscriptionRecord } from './subscription.types';

const ofPlan = (plan: PlanLookup): SeatTarget => ({
  kind: 'PLAN',
  subscriptionId: null,
  planId: plan.id,
  planName: plan.name,
  applicationId: plan.applicationId,
  applicationName: plan.applicationName,
  applicationKind: plan.applicationKind,
  provisioningType: plan.provisioningType,
  applicationStatus: plan.applicationStatus,
  status: null,
  missing: [],
  purchasedQuantity: null,
  ownerDepartmentId: null,
});

const ofSubscription = (subscription: SubscriptionRecord, plan: PlanLookup): SeatTarget => ({
  ...ofPlan(plan),
  kind: 'SUBSCRIPTION',
  subscriptionId: subscription.id,
  status: subscription.status,
  missing: missingData({
    kind: subscription.kind,
    planPricingModel: plan.pricingModel,
    quantity: subscription.purchasedQuantity,
    startDate: subscription.startDate,
    billingCycle: subscription.billingCycle,
    hasPrice: subscription.unitPrice !== null,
    hasSnapshot: subscription.priceSnapshot !== null,
  }),
  purchasedQuantity: subscription.purchasedQuantity,
  ownerDepartmentId: subscription.ownerDepartmentId,
});

/**
 * What the assignments of seats read of the subscriptions and the plans (`US-02-05`): the target of a seat with its
 * kind of provisioning and the seats bought. `find` reads without a lock, for a preview; `lock` holds the subscription
 * `FOR UPDATE` (so a change of its seats waits for the writer) or an internal plan `FOR SHARE` until the transaction ends.
 */
@Injectable()
export class SeatTargetService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanLookupService,
  ) {}

  async find(ref: SeatTargetRef, tx?: DbTx): Promise<SeatTarget | null> {
    if ('planId' in ref) {
      const plan = await this.plans.find(ref.planId);

      return plan ? ofPlan(plan) : null;
    }
    const subscription = await this.subscriptions.find(ref.subscriptionId, tx);

    return subscription ? this.withPlan(subscription) : null;
  }

  /** The seat targets of many plans in one read, without a lock; a plan that does not exist is absent (`LD-08`). */
  async findPlans(planIds: readonly string[], tx?: DbTx): Promise<SeatTarget[]> {
    return (await this.plans.lookups(planIds, tx)).map(ofPlan);
  }

  async lock(tx: DbTx, ref: SeatTargetRef): Promise<SeatTarget | null> {
    if ('planId' in ref) {
      const plan = await this.plans.lockShared(tx, ref.planId);

      return plan ? ofPlan(plan) : null;
    }
    const subscription = await this.subscriptions.lock(tx, ref.subscriptionId);

    return subscription ? this.withPlan(subscription, tx) : null;
  }

  private async withPlan(subscription: SubscriptionRecord, tx?: DbTx): Promise<SeatTarget | null> {
    const plan = tx ? await this.plans.lockShared(tx, subscription.planId) : await this.plans.find(subscription.planId);

    return plan ? ofSubscription(subscription, plan) : null;
  }
}
