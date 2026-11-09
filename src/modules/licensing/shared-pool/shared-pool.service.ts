import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatTargetNotFoundError } from '../public/licensing.errors';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { PoolSubscription } from '../../catalog/public/catalog.types';
import type { PlanStock } from '../public/licensing-pool-stock.types';
import type { SubscriptionOccupancy } from './shared-pool-capacity.repo';
import { SharedPoolAvoidedCostRepo } from './shared-pool-avoided-cost.repo';
import { SharedPoolCapacityRepo } from './shared-pool-capacity.repo';
import { avoidedCostOf, judgePurchase, type PoolStock, type PurchaseDecision } from './shared-pool.policy';

type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

/**
 * The stock of a plan from its grantable subscriptions and what is taken of them: free seats are the seats bought less the most assignments
 * held on any day from today on (as the database counts them), so a seat already promised from a later day is not free today. A K4 plan
 * also needs a key for each seat: its free seats are never more than the free keys of the subscription (`keys`).
 */
function stockFrom(
  subscriptions: readonly PoolSubscription[],
  occupancy: ReadonlyMap<string, SubscriptionOccupancy>,
  keys: ReadonlyMap<string, number> | null = null,
): PoolStock {
  let free = 0;
  let inRevocation = 0;
  const freeSubscriptionIds: string[] = [];
  const freeBySubscription = new Map<string, number>();
  for (const subscription of subscriptions) {
    const taken = occupancy.get(subscription.subscriptionId);
    const seats = Math.max(0, (subscription.purchasedQuantity ?? 0) - (taken?.occupied ?? 0));
    const left = keys === null ? seats : Math.min(seats, keys.get(subscription.subscriptionId) ?? 0);
    free += left;
    inRevocation += taken?.inRevocation ?? 0;
    freeBySubscription.set(subscription.subscriptionId, left);
    if (left > 0) freeSubscriptionIds.push(subscription.subscriptionId);
  }

  return { free, inRevocation, freeSubscriptionIds, freeBySubscription };
}

/**
 * The shared pool of a plan (`QĐ-103d`): what is free in it, whether a purchase may be recorded with a grant, and the cost avoided by a
 * grant taken from it. Reads run in the transaction of the grant, after the subscription and plan locks of the grant are taken, so the
 * count cannot change between the check and the write. Throws the errors of the purchase policy.
 */
@Injectable()
export class SharedPoolService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly capacityRepo: SharedPoolCapacityRepo,
    private readonly avoidedCosts: SharedPoolAvoidedCostRepo,
  ) {}

  /**
   * What the subscriptions of the plan hold from today on: free seats are the seats bought less the most assignments held on any day from
   * today on. The period that runs and the next one recorded ahead of its start are one pool (`getGrantableSubscriptions`).
   */
  async stockOf(
    tx: DbTx,
    planId: string,
    today: BusinessDate,
    provisioningType?: ProvisioningType,
  ): Promise<PoolStock> {
    const subscriptions = await this.catalog.getGrantableSubscriptions(planId, today, tx);

    return this.stockOfSubscriptions(tx, subscriptions, today, provisioningType === 'K4');
  }

  /** The stock of these subscriptions under the transaction; a K4 plan counts its free keys too (`QĐ-103d`). */
  private async stockOfSubscriptions(
    tx: DbTx,
    subscriptions: readonly PoolSubscription[],
    today: BusinessDate,
    withKeys: boolean,
  ): Promise<PoolStock> {
    const ids = subscriptions.map((subscription) => subscription.subscriptionId);
    const occupancy = await this.capacityRepo.occupancyOf(tx, ids, today);
    const keys = withKeys ? await this.capacityRepo.freeKeysOf(tx, ids) : null;

    return stockFrom(subscriptions, occupancy, keys);
  }

  /** The kind of provisioning of the plan. Throws SeatTargetNotFoundError when the plan does not exist. */
  async provisioningTypeOf(tx: DbTx, planId: string): Promise<ProvisioningType> {
    const target = await this.catalog.findSeatTarget({ planId }, tx);
    if (!target) throw new SeatTargetNotFoundError('PLAN');

    return target.provisioningType;
  }

  /**
   * The stock of many plans for the queue of grants, in a fixed number of reads whatever the number of plans: only a K2 plan (seats) or a K4
   * plan (keys) has a pool; any other plan is `NONE`, with nothing counted. A plan that does not exist is absent.
   */
  async stockOfPlans(planIds: readonly string[], today: BusinessDate): Promise<Map<string, PlanStock>> {
    const stocks = new Map<string, PlanStock>();
    const targets = await this.catalog.findPlanSeatTargets(planIds);
    const pooled = targets.filter((target) => target.provisioningType === 'K2' || target.provisioningType === 'K4');
    const grantable = await this.catalog.getGrantableSubscriptionsOfPlans(
      pooled.map((target) => target.planId),
      today,
    );
    const occupancy = await this.capacityRepo.occupancyOfMany(
      [...grantable.values()].flat().map((subscription) => subscription.subscriptionId),
      today,
    );
    const keyPlans = new Set(
      pooled.filter((target) => target.provisioningType === 'K4').map((target) => target.planId),
    );
    const keys = await this.capacityRepo.freeKeysOfMany(
      [...grantable.entries()]
        .filter(([planId]) => keyPlans.has(planId))
        .flatMap(([, subscriptions]) => subscriptions.map((subscription) => subscription.subscriptionId)),
    );
    for (const target of targets) {
      if (target.provisioningType !== 'K2' && target.provisioningType !== 'K4') {
        stocks.set(target.planId, { kind: 'NONE', free: 0, inRevocation: 0 });
        continue;
      }
      const { free, inRevocation } = stockFrom(
        grantable.get(target.planId) ?? [],
        occupancy,
        keyPlans.has(target.planId) ? keys : null,
      );
      stocks.set(target.planId, { kind: target.provisioningType === 'K2' ? 'SEATS' : 'KEYS', free, inRevocation });
    }

    return stocks;
  }

  /**
   * The subscription a grant takes its seat from when the IT Admin names none (`P0-05`): for a K2 or K4 plan the primary subscription of the
   * plan, or the one that would price it, among those that still have a free seat, and when none has one the first of all (a purchase tops it
   * up); for a K1 plan, which has no pool, the first. Null when the plan has no subscription a seat can be taken from today.
   */
  async chooseSubscription(
    tx: DbTx,
    input: { planId: string; provisioningType: ProvisioningType; today: BusinessDate },
  ): Promise<string | null> {
    const subscriptions = await this.catalog.getGrantableSubscriptions(input.planId, input.today, tx);
    if (input.provisioningType !== 'K2' && input.provisioningType !== 'K4')
      return subscriptions[0]?.subscriptionId ?? null;
    const stock = await this.stockOfSubscriptions(tx, subscriptions, input.today, input.provisioningType === 'K4');
    const withRoom = subscriptions.find(
      (subscription) => (stock.freeBySubscription.get(subscription.subscriptionId) ?? 0) > 0,
    );

    return (withRoom ?? subscriptions[0])?.subscriptionId ?? null;
  }

  /**
   * Whether the purchase the IT Admin asks for with a grant may be recorded (`BR-MF1-09a`, `BR-MF1-09b`), with the stock the answer was
   * read from. A K2 or K4 grant always reads the stock: the grant that buys nothing is told how many seats the other subscriptions of the plan
   * hold free when its own subscription is full.
   */
  async judgePurchase(
    tx: DbTx,
    input: {
      planId: string;
      provisioningType: ProvisioningType;
      today: BusinessDate;
      purchase: { reason?: string } | undefined;
    },
  ): Promise<{ decision: PurchaseDecision; stock: PoolStock | null }> {
    const pooled = input.provisioningType === 'K2' || input.provisioningType === 'K4';
    const stock = pooled ? await this.stockOf(tx, input.planId, input.today, input.provisioningType) : null;

    return {
      decision: judgePurchase({ provisioningType: input.provisioningType, purchase: input.purchase, stock }),
      stock,
    };
  }

  /**
   * Records the cost avoided when the task of a grant taken from the pool is completed (`BR-MF1-09c`): the caller calls it only for a K2 or K4
   * grant with nothing bought for it; once for the task, and only when its subscription has a price. Changes no commitment or budget.
   */
  async recordAvoided(
    tx: DbTx,
    input: {
      organizationId: string;
      completedOn: BusinessDate;
      task: {
        id: string;
        assignmentId: string;
        requestId: string;
        planId: string;
        subscriptionId: string | null;
        provisioningType: 'K2' | 'K4';
      };
    },
  ): Promise<void> {
    const { task } = input;
    if (task.subscriptionId === null) return;

    const cost = avoidedCostOf({
      provisioningType: task.provisioningType,
      completedOn: input.completedOn,
      price: await this.catalog.getSubscriptionPrice(task.subscriptionId, tx),
    });
    if (cost === null) return;

    await this.avoidedCosts.record(tx, {
      organizationId: input.organizationId,
      provisioningTaskId: task.id,
      assignmentId: task.assignmentId,
      requestId: task.requestId,
      planId: task.planId,
      recordedOn: input.completedOn,
      cost,
    });
  }
}
