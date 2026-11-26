import { Injectable, Optional } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatTargetNotFoundError } from '../public/licensing.errors';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicenseLotReservedForRequestError } from '../../catalog/public/catalog.errors';
import {
  LicenseLotStockApi,
  type LicenseLotStockItem,
  type RequestLotReservation,
} from '../../catalog/public/license-lot-stock.api';
import type { PoolSubscription } from '../../catalog/public/catalog.types';
import { SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
import { GrantRequestGateHook } from '../public/licensing.extension-points';
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

function lotStockFrom(candidates: readonly LicenseLotStockItem[], requestId: string | null): PoolStock {
  const ownLot = requestId ? candidates.find((l) => l.purpose === 'REQUEST' && l.requestId === requestId) : undefined;
  const scope = ownLot ? [ownLot] : candidates;
  let free = 0;
  const freeSubscriptionIds: string[] = [];
  const freeBySubscription = new Map<string, number>();
  for (const lot of scope) {
    const available =
      lot.purpose === 'REQUEST' && lot.requestId !== requestId
        ? Math.min(lot.grantable, lot.excessGrantable)
        : lot.grantable;
    free += available;
    freeBySubscription.set(lot.id, available);
    if (available > 0) freeSubscriptionIds.push(lot.id);
  }

  return { free, inRevocation: 0, freeSubscriptionIds, freeBySubscription };
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
    @Optional() private readonly lotStock?: LicenseLotStockApi,
    @Optional() private readonly gate?: GrantRequestGateHook,
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
    options?: { requestId?: string | null },
  ): Promise<PoolStock> {
    if (provisioningType === 'K1') {
      return { free: 0, inRevocation: 0, freeSubscriptionIds: [], freeBySubscription: new Map() };
    }
    if (provisioningType === 'K4' && this.lotStock) {
      return this.stockOfLots(tx, planId, options?.requestId ?? null);
    }
    const subscriptions = await this.grantableOf(tx, planId, today);

    return this.stockOfSubscriptions(tx, planId, subscriptions, today, provisioningType === 'K4');
  }

  /** Stock of a K4 `ACCOUNT` plan derived from its license lots and F11 reservation state. */
  async stockOfLots(tx: DbTx, planId: string, requestId: string | null): Promise<PoolStock> {
    if (!this.lotStock) {
      return { free: 0, inRevocation: 0, freeSubscriptionIds: [], freeBySubscription: new Map() };
    }
    const raw = await this.lotStock.accountLotCandidates(planId, undefined, tx);
    const reservations = await this.lotReservationsOf(raw, tx);
    const candidates =
      reservations.size > 0 ? await this.lotStock.accountLotCandidates(planId, { reservations }, tx) : raw;

    return lotStockFrom(candidates, requestId);
  }

  /** Reads F11 `(beneficiaries, chargedExcess)` for all `REQUEST` lots via `GrantRequestGateHook`. */
  async lotReservationsOf(
    candidates: readonly LicenseLotStockItem[],
    tx?: DbTx,
  ): Promise<Map<string, RequestLotReservation>> {
    const reqLots = candidates
      .filter((l) => l.purpose === 'REQUEST' && l.requestId !== null)
      .map((l) => ({ lotId: l.id, requestId: l.requestId as string }));
    if (reqLots.length === 0 || !this.gate?.isBound()) return new Map();

    return (await this.gate.get().reservedForRequestLots?.(reqLots, tx)) ?? new Map();
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
      if (keyPlans.has(target.planId) && this.lotStock) {
        const k4Stock = await this.stockOfLotsWithoutTx(target.planId);
        stocks.set(target.planId, { kind: 'KEYS', free: k4Stock.free, inRevocation: k4Stock.inRevocation });
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

  private async stockOfLotsWithoutTx(planId: string): Promise<PoolStock> {
    if (!this.lotStock) {
      return { free: 0, inRevocation: 0, freeSubscriptionIds: [], freeBySubscription: new Map() };
    }
    const raw = await this.lotStock.accountLotCandidates(planId);
    const reservations = await this.lotReservationsOf(raw);
    const candidates = reservations.size > 0 ? await this.lotStock.accountLotCandidates(planId, { reservations }) : raw;

    return lotStockFrom(candidates, null);
  }

  /**
   * The subscription/line a grant takes its seat from when the IT Admin names none (`P0-05`): for K2/K4, prefers
   * candidates that still have free seats ordered deterministically by `lineCreatedAt ASC`, `subscriptionLineId ASC`.
   */
  async chooseLine(
    tx: DbTx,
    input: {
      planId: string;
      provisioningType: ProvisioningType;
      today: BusinessDate;
      requestId?: string | null;
      excludeTaskId?: string;
    },
  ): Promise<string | null> {
    if (input.provisioningType === 'K1') return null;
    if (input.provisioningType === 'K4' && this.lotStock) {
      return this.chooseK4AccountLot(tx, input);
    }
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

  private async chooseK4AccountLot(
    tx: DbTx,
    input: { planId: string; requestId?: string | null; excludeTaskId?: string },
  ): Promise<string | null> {
    if (!this.lotStock) return null;
    const raw = await this.lotStock.accountLotCandidates(input.planId, { excludeTaskId: input.excludeTaskId }, tx);
    if (raw.length === 0) return null;
    const reservations = await this.lotReservationsOf(raw, tx);
    const result = await this.lotStock.chooseAccountLot(
      {
        planId: input.planId,
        ownRequestId: input.requestId ?? null,
        reservations,
        excludeTaskId: input.excludeTaskId,
      },
      tx,
    );
    if (result.kind === 'RESERVED_FOR_REQUEST') {
      throw new LicenseLotReservedForRequestError(result.lot.id);
    }

    return result.kind === 'SELECTED' ? result.lot.id : (result.lot?.id ?? null);
  }

  /** Batch `chooseLine` resolution per K2 planId: which subscription/line receives the next seat grant for that plan. */
  async chosenLinesOfPlans(
    planIds: readonly string[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, { subscriptionId: string; subscriptionLineId: string | null }>> {
    const result = new Map<string, { subscriptionId: string; subscriptionLineId: string | null }>();
    const uniquePlans = [...new Set(planIds)];
    if (uniquePlans.length === 0) return result;

    const grantableOfPlans = await this.catalog.getGrantableSubscriptionsOfPlans(uniquePlans, today, tx);
    const ending = await this.capacityRepo.endingAmong(
      [...grantableOfPlans.values()].flat().map((subscription) => subscription.subscriptionId),
      tx,
    );
    const grantable = new Map(
      [...grantableOfPlans].map(([planId, subscriptions]) => [planId, this.withoutEnding(subscriptions, ending)]),
    );
    const pairs = [...grantable.entries()].flatMap(([planId, subs]) =>
      subs.map((subscription) => ({ subscriptionId: subscription.subscriptionId, planId })),
    );
    const pairOccupancy = await this.capacityRepo.occupancyOfPlanPairs(pairs, today, tx);
    const lineIds = [...grantable.values()]
      .flat()
      .map((s) => s.subscriptionLineId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const ledgerSeats = lineIds.length > 0 ? await this.seatLedger.seatsOnDays(lineIds, today, today, tx) : undefined;

    for (const planId of uniquePlans) {
      const subs = grantable.get(planId) ?? [];
      if (subs.length === 0) continue;
      const stock = stockFrom(subs, planOccupancySlice(planId, subs, pairOccupancy), null, ledgerSeats, today);
      const chosen = choosePoolLine(subs, stock);
      if (chosen) {
        result.set(planId, {
          subscriptionId: chosen.subscriptionId,
          subscriptionLineId: chosen.subscriptionLineId ?? null,
        });
      }
    }

    return result;
  }

  /**
   * Read-only `chooseLine` context for a K2 plan: returns `free` seats today and, when `free === 0`, the line
   * `chooseLine` would select along with its monthly unit price, minimum seats, and seat total today.
   */
  async chosenK2LineContext(
    planId: string,
    today: BusinessDate,
  ): Promise<{
    free: number;
    chosen: {
      subscriptionId: string;
      monthlyUnitPriceMinor: bigint;
      minimumSeats: number | null;
      seatsToday: number;
    } | null;
  } | null> {
    const rawSubs = await this.catalog.getGrantableSubscriptions(planId, today);
    const ending = await this.capacityRepo.endingAmong(rawSubs.map(idOf));
    const subscriptions = this.withoutEnding(rawSubs, ending);
    if (subscriptions.length === 0) return null;

    const pairs = subscriptions.map((sub) => ({ subscriptionId: sub.subscriptionId, planId }));
    const pairOccupancy = await this.capacityRepo.occupancyOfPlanPairs(pairs, today);
    const lineIds = subscriptions
      .map((s) => s.subscriptionLineId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const ledgerSeats = lineIds.length > 0 ? await this.seatLedger.seatsOnDays(lineIds, today, today) : undefined;
    const stock = stockFrom(
      subscriptions,
      planOccupancySlice(planId, subscriptions, pairOccupancy),
      null,
      ledgerSeats,
      today,
    );
    if (stock.free > 0) return { free: stock.free, chosen: null };

    const chosen = choosePoolLine(subscriptions, stock);
    if (!chosen?.subscriptionLineId) return { free: 0, chosen: null };
    const [line] = await this.seatLedger.linesOfIds([chosen.subscriptionLineId]);
    if (!line) return { free: 0, chosen: null };
    const seatsToday = ledgerSeats?.get(chosen.subscriptionLineId)?.get(today) ?? chosen.purchasedQuantity ?? 0;

    return {
      free: 0,
      chosen: {
        subscriptionId: chosen.subscriptionId,
        monthlyUnitPriceMinor: line.monthlyUnitPriceMinor,
        minimumSeats: line.minimumSeats,
        seatsToday,
      },
    };
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
      requestId?: string | null;
    },
  ): Promise<{ decision: PurchaseDecision; stock: PoolStock | null }> {
    const pooled = input.provisioningType === 'K2' || input.provisioningType === 'K4';
    const stock = pooled
      ? await this.stockOf(tx, input.planId, input.today, input.provisioningType, { requestId: input.requestId })
      : null;

    return {
      decision: judgePurchase({ provisioningType: input.provisioningType, purchase: input.purchase, stock }),
      stock,
    };
  }

  /**
   * Records the pre-computed cost avoided when a pool grant task completes (`B1-R8`), once per task.
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
