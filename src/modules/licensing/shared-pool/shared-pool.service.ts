import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatTargetNotFoundError } from '../public/licensing.errors';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { PoolSubscription } from '../../catalog/public/catalog.types';
import { SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
import type { PlanStock } from '../public/licensing.types';
import type { SubscriptionOccupancy } from './shared-pool-capacity.repo';
import { SharedPoolAvoidedCostRepo } from './shared-pool-avoided-cost.repo';
import { SharedPoolCapacityRepo } from './shared-pool-capacity.repo';
import { choosePoolLine, judgePurchase, type PoolStock, type PurchaseDecision } from './shared-pool.policy';

const idOf = (subscription: PoolSubscription): string => subscription.subscriptionId;

type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

function freeSeatsOfSubscription(
  subscription: PoolSubscription,
  taken: SubscriptionOccupancy | undefined,
  keys: ReadonlyMap<string, number> | null,
  ledgerSeats: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>> | undefined,
  today: BusinessDate | undefined,
): number {
  const ledgerTotal =
    subscription.subscriptionLineId && today !== undefined
      ? (ledgerSeats?.get(subscription.subscriptionLineId)?.get(today) ?? null)
      : null;
  const totalSeats = ledgerTotal ?? subscription.purchasedQuantity ?? 0;
  const seats = Math.max(0, totalSeats - (taken?.occupied ?? 0));

  return keys === null ? seats : Math.min(seats, keys.get(subscription.subscriptionId) ?? 0);
}

function stockFrom(
  subscriptions: readonly PoolSubscription[],
  occupancy: ReadonlyMap<string, SubscriptionOccupancy>,
  keys: ReadonlyMap<string, number> | null = null,
  ledgerSeats?: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>>,
  today?: BusinessDate,
): PoolStock {
  let free = 0;
  let inRevocation = 0;
  const freeSubscriptionIds: string[] = [];
  const freeBySubscription = new Map<string, number>();
  for (const subscription of subscriptions) {
    const taken = occupancy.get(subscription.subscriptionId);
    const left = freeSeatsOfSubscription(subscription, taken, keys, ledgerSeats, today);
    free += left;
    inRevocation += taken?.inRevocation ?? 0;
    freeBySubscription.set(subscription.subscriptionId, left);
    if (left > 0) freeSubscriptionIds.push(subscription.subscriptionId);
  }

  return { free, inRevocation, freeSubscriptionIds, freeBySubscription };
}

function planOccupancySlice(
  planId: string,
  subscriptions: readonly PoolSubscription[],
  pairOccupancy: ReadonlyMap<string, SubscriptionOccupancy>,
): Map<string, SubscriptionOccupancy> {
  const slice = new Map<string, SubscriptionOccupancy>();
  for (const sub of subscriptions) {
    const found = pairOccupancy.get(`${sub.subscriptionId}:${planId}`);
    if (found) slice.set(sub.subscriptionId, found);
  }

  return slice;
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
    private readonly seatLedger: SeatLedgerApi,
  ) {}

  /**
   * The subscriptions of the plan a seat can be taken from today: the grantable ones of the catalog (`getGrantableSubscriptions`) less those
   * the company recorded as cancelled, which the catalog still shows until the closing of the subscription is written (`A1C-02`, `QĐ-99i`).
   */
  async grantableOf(tx: DbTx, planId: string, today: BusinessDate): Promise<PoolSubscription[]> {
    const subscriptions = await this.catalog.getGrantableSubscriptions(planId, today, tx);

    return this.withoutEnding(subscriptions, await this.capacityRepo.endingAmong(subscriptions.map(idOf), tx));
  }

  private withoutEnding(subscriptions: readonly PoolSubscription[], ending: ReadonlySet<string>): PoolSubscription[] {
    return subscriptions.filter((subscription) => !ending.has(subscription.subscriptionId));
  }

  /**
   * What the subscriptions of the plan hold from today on: free seats are the seats bought less the most assignments held on any day from
   * today on. The period that runs and the next one recorded ahead of its start are one pool: the next is not among the subscriptions
   * (`getGrantableSubscriptions`), its seats being those of the one that runs (`QĐ-111n`).
   */
  async stockOf(
    tx: DbTx,
    planId: string,
    today: BusinessDate,
    provisioningType?: ProvisioningType,
  ): Promise<PoolStock> {
    if (provisioningType === 'K1') {
      return { free: 0, inRevocation: 0, freeSubscriptionIds: [], freeBySubscription: new Map() };
    }
    const subscriptions = await this.grantableOf(tx, planId, today);

    return this.stockOfSubscriptions(tx, planId, subscriptions, today, provisioningType === 'K4');
  }

  /** The stock of these subscriptions under the transaction; a K4 plan counts its free keys too (`QĐ-103d`). */
  private async stockOfSubscriptions(
    tx: DbTx,
    planId: string,
    subscriptions: readonly PoolSubscription[],
    today: BusinessDate,
    withKeys: boolean,
  ): Promise<PoolStock> {
    const ids = subscriptions.map((subscription) => subscription.subscriptionId);
    const occupancy = await this.capacityRepo.occupancyOfPlan(tx, ids, planId, today);
    const lineIds = subscriptions
      .map((s) => s.subscriptionLineId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const ledgerSeats =
      !withKeys && lineIds.length > 0 ? await this.seatLedger.seatsOnDays(lineIds, today, today, tx) : undefined;
    const keys = withKeys ? await this.capacityRepo.freeKeysOf(tx, ids) : null;

    return stockFrom(subscriptions, occupancy, keys, ledgerSeats, today);
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
    const grantableOfPlans = await this.catalog.getGrantableSubscriptionsOfPlans(
      pooled.map((target) => target.planId),
      today,
    );
    const ending = await this.capacityRepo.endingAmong(
      [...grantableOfPlans.values()].flat().map((subscription) => subscription.subscriptionId),
    );
    const grantable = new Map(
      [...grantableOfPlans].map(([planId, subscriptions]) => [planId, this.withoutEnding(subscriptions, ending)]),
    );
    const pairs = [...grantable.entries()].flatMap(([planId, subs]) =>
      subs.map((subscription) => ({ subscriptionId: subscription.subscriptionId, planId })),
    );
    const pairOccupancy = await this.capacityRepo.occupancyOfPlanPairs(pairs, today);
    const keyPlans = new Set(
      pooled.filter((target) => target.provisioningType === 'K4').map((target) => target.planId),
    );
    const k2LineIds = [...grantable.entries()]
      .filter(([planId]) => !keyPlans.has(planId))
      .flatMap(([, subs]) =>
        subs.map((s) => s.subscriptionLineId).filter((id): id is string => typeof id === 'string' && id.length > 0),
      );
    const ledgerSeats = k2LineIds.length > 0 ? await this.seatLedger.seatsOnDays(k2LineIds, today, today) : undefined;
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
      const subs = grantable.get(target.planId) ?? [];
      const occupancy = planOccupancySlice(target.planId, subs, pairOccupancy);
      const { free, inRevocation } = stockFrom(
        subs,
        occupancy,
        keyPlans.has(target.planId) ? keys : null,
        keyPlans.has(target.planId) ? undefined : ledgerSeats,
        today,
      );
      stocks.set(target.planId, { kind: target.provisioningType === 'K2' ? 'SEATS' : 'KEYS', free, inRevocation });
    }

    return stocks;
  }

  /**
   * The subscription/line a grant takes its seat from when the IT Admin names none (`P0-05`): for K2/K4, prefers
   * candidates that still have free seats ordered deterministically by `lineCreatedAt ASC`, `subscriptionLineId ASC`.
   */
  async chooseLine(
    tx: DbTx,
    input: { planId: string; provisioningType: ProvisioningType; today: BusinessDate },
  ): Promise<string | null> {
    if (input.provisioningType === 'K1') return null;
    const subscriptions = await this.grantableOf(tx, input.planId, input.today);
    if (input.provisioningType !== 'K2' && input.provisioningType !== 'K4') {
      return subscriptions[0]?.subscriptionId ?? null;
    }
    const stock = await this.stockOfSubscriptions(
      tx,
      input.planId,
      subscriptions,
      input.today,
      input.provisioningType === 'K4',
    );

    return choosePoolLine(subscriptions, stock)?.subscriptionId ?? null;
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
   * Records the pre-computed cost avoided when a pool grant task completes (`W3-09`, `B1-R8`), once per task.
   */
  recordAvoidedCost(
    tx: DbTx,
    taskId: string,
    amount: { amountMinor: bigint; currency: string },
    completedOn: BusinessDate,
  ): Promise<void> {
    return this.avoidedCosts.recordForTask(tx, taskId, amount, completedOn);
  }
}
