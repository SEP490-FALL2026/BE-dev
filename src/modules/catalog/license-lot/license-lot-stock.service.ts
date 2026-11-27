import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PlanFactsService } from '../plan/plan-facts.service';
import { SeatOccupancyHook, type OpenK4GrantTask } from '../public/catalog.extension-points';
import {
  chooseAccountLot,
  countOpenTasksByLot,
  excessGrantableOf,
  pickK4LotUnitPrice,
  type AccountLotWithGrantable,
  type LotChoiceResult,
} from './license-lot-price.policy';
import { freeOf } from './license-lot.policy';
import { LicenseLotRepo } from './license-lot.repo';
import type { LicenseLotRecord } from './license-lot.types';

export interface RequestLotReservation {
  beneficiaries: number;
  chargedExcess: number;
}

export interface AccountLotVacancy {
  lotId: string;
  planId: string;
  applicationId: string;
  pricingModel: 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST' | null;
  purchased: number;
  occupied: number;
  free: number;
}

@Injectable()
export class LicenseLotStockService {
  constructor(
    private readonly lots: LicenseLotRepo,
    private readonly plans: PlanFactsService,
    private readonly occupancy: SeatOccupancyHook,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Returns lot candidates for an `ACCOUNT` K4 plan enriched with occupied/keys/open-task counts. */
  async accountLotCandidates(
    planId: string,
    options?: {
      reservations?: ReadonlyMap<string, RequestLotReservation>;
      excludeTaskId?: string;
    },
    tx?: DbTx,
  ): Promise<AccountLotWithGrantable[]> {
    const lotRows = await this.lots.ofPlan(planId, tx);
    if (lotRows.length === 0) return [];
    const reader = this.occupancy.get();
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const ids = lotRows.map((l) => l.id);
    const taken = await reader.seatsOfSubscriptions(ids, today, tx);
    const keys = await reader.keyCountsOfLots(ids, tx);
    const rawTasks = await reader.openGrantTasksWithoutKeyOfPlans([planId], tx);
    const filteredTasks = options?.excludeTaskId
      ? rawTasks.filter((t) => t.taskId !== options.excludeTaskId)
      : rawTasks;

    return this.enrichLots(lotRows, taken, keys, filteredTasks, options?.reservations);
  }

  /** Chooses the `ACCOUNT` lot to grant a license from, enforcing `F11` reservation and own-lot exclusivity. */
  async chooseAccountLot(
    input: {
      planId: string;
      ownRequestId: string | null;
      reservations?: ReadonlyMap<string, RequestLotReservation>;
      excludeTaskId?: string;
    },
    tx?: DbTx,
  ): Promise<LotChoiceResult> {
    const lots = await this.accountLotCandidates(
      input.planId,
      { reservations: input.reservations, excludeTaskId: input.excludeTaskId },
      tx,
    );

    return chooseAccountLot({ lots, ownRequestId: input.ownRequestId });
  }

  /** Returns the unit price of the newest lot of the plan with `free > 0` (`K-A5`, `QĐ-116am`), or `null`. */
  async newestFreeLotUnitPrice(planId: string, tx?: DbTx): Promise<bigint | null> {
    const lotRows = await this.lots.ofPlan(planId, tx);
    if (lotRows.length === 0) return null;
    const reader = this.occupancy.get();
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const taken = await reader.seatsOfSubscriptions(
      lotRows.map((l) => l.id),
      today,
      tx,
    );

    return pickK4LotUnitPrice(
      lotRows.map((l) => ({
        id: l.id,
        purchasedOn: l.purchasedOn,
        unitPriceMinor: l.unitPriceMinor,
        free: freeOf(l.licenseCount, taken.get(l.id)?.occupied ?? 0, l.unitPriceMinor).free,
      })),
    );
  }

  /** Lists plans among `planIds` that have at least one lot with `free > 0` (`QĐ-113a` pricing cycle check). */
  async plansWithFreeLot(planIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    const result = new Set<string>();
    if (planIds.length === 0) return result;
    const byPlan = await this.lots.ofPlans(planIds, tx);
    const allLots = [...byPlan.values()].flat();
    if (allLots.length === 0) return result;
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const taken = await this.occupancy.get().seatsOfSubscriptions(
      allLots.map((l) => l.id),
      today,
      tx,
    );
    for (const [planId, rows] of byPlan) {
      if (rows.some((l) => l.licenseCount - (taken.get(l.id)?.occupied ?? 0) > 0)) {
        result.add(planId);
      }
    }

    return result;
  }

  /** Counts open grant tasks without keys mapped to each lot ID for list/detail view `grantable`. */
  async openTasksByLot(
    records: readonly LicenseLotRecord[],
    taken: ReadonlyMap<string, { occupied: number }>,
    keys: ReadonlyMap<string, { inStore: number }>,
    tx?: DbTx,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const reader = this.occupancy.get();
    if (records.length === 0) return result;
    const planIds = [...new Set(records.map((r) => r.planId))];
    const byPlanLots = await this.lots.ofPlans(planIds, tx);
    const allPlanLots = [...byPlanLots.values()].flat();
    const missingIds = allPlanLots.map((l) => l.id).filter((id) => !taken.has(id));
    let fullTaken = taken;
    let fullKeys = keys;
    if (missingIds.length > 0) {
      const today = await this.organizationReads.businessToday(new Date(), tx);
      const extraTaken = await reader.seatsOfSubscriptions(missingIds, today, tx);
      const extraKeys = await reader.keyCountsOfLots(missingIds, tx);
      fullTaken = new Map([...taken, ...extraTaken]);
      fullKeys = new Map([...keys, ...extraKeys]);
    }
    const tasks = await reader.openGrantTasksWithoutKeyOfPlans(planIds, tx);
    const tasksByPlan = new Map<string, OpenK4GrantTask[]>();
    for (const t of tasks) tasksByPlan.set(t.planId, [...(tasksByPlan.get(t.planId) ?? []), t]);
    for (const [planId, planLots] of byPlanLots) {
      const mapped = countOpenTasksByLot(
        planLots.map((l) => ({
          id: l.id,
          purchasedOn: l.purchasedOn,
          purpose: l.purpose,
          requestId: l.requestId,
          legacySubscriptionId: l.legacySubscriptionId,
          free: Math.max(0, l.licenseCount - (fullTaken.get(l.id)?.occupied ?? 0)),
          keysInStore: fullKeys.get(l.id)?.inStore ?? 0,
        })),
        tasksByPlan.get(planId) ?? [],
      );
      for (const [lotId, count] of mapped) result.set(lotId, count);
    }

    return result;
  }

  /** Returns `ACCOUNT` K4 lots with `free > 0` for `G1` wasted-seat rule. */
  async listAccountVacancies(asOf: BusinessDate, tx?: DbTx): Promise<AccountLotVacancy[]> {
    const allLots = await this.lots.allAccountLots(tx);
    if (allLots.length === 0) return [];
    const reader = this.occupancy.get();
    const taken = await reader.seatsOfSubscriptions(
      allLots.map((l) => l.id),
      asOf,
      tx,
    );
    const plans = new Map(
      (await this.plans.lookups([...new Set(allLots.map((l) => l.planId))], tx)).map((p) => [p.id, p]),
    );
    const result: AccountLotVacancy[] = [];
    for (const lot of allLots) {
      const plan = plans.get(lot.planId);
      if (!plan || plan.provisioningType !== 'K4' || plan.keyBinding !== 'ACCOUNT') continue;
      const occupied = taken.get(lot.id)?.occupied ?? 0;
      const free = Math.max(0, lot.licenseCount - occupied);
      result.push({
        lotId: lot.id,
        planId: lot.planId,
        applicationId: plan.applicationId,
        pricingModel: plan.pricingModel,
        purchased: lot.licenseCount,
        occupied,
        free,
      });
    }

    return result;
  }

  private enrichLots(
    lotRows: readonly LicenseLotRecord[],
    taken: ReadonlyMap<string, { occupied: number }>,
    keys: ReadonlyMap<string, { inStore: number }>,
    tasks: readonly OpenK4GrantTask[],
    reservations?: ReadonlyMap<string, RequestLotReservation>,
  ): AccountLotWithGrantable[] {
    const taskCounts = countOpenTasksByLot(
      lotRows.map((l) => ({
        id: l.id,
        purchasedOn: l.purchasedOn,
        purpose: l.purpose,
        requestId: l.requestId,
        legacySubscriptionId: l.legacySubscriptionId,
        free: Math.max(0, l.licenseCount - (taken.get(l.id)?.occupied ?? 0)),
        keysInStore: keys.get(l.id)?.inStore ?? 0,
      })),
      tasks,
    );

    return lotRows.map((l) =>
      this.toAccountLotCandidate(
        l,
        taken.get(l.id)?.occupied ?? 0,
        keys.get(l.id)?.inStore ?? 0,
        taskCounts.get(l.id) ?? 0,
        reservations?.get(l.id),
      ),
    );
  }

  private toAccountLotCandidate(
    l: LicenseLotRecord,
    occupied: number,
    keysInStore: number,
    openTasksWithoutKey: number,
    res: RequestLotReservation | undefined,
  ): AccountLotWithGrantable {
    const { free } = freeOf(l.licenseCount, occupied, l.unitPriceMinor);
    const beneficiaries = l.purpose === 'REQUEST' ? (res?.beneficiaries ?? 1) : 0;
    const chargedExcess = res?.chargedExcess ?? 0;

    return {
      id: l.id,
      purchasedOn: l.purchasedOn,
      licenseCount: l.licenseCount,
      unitPriceMinor: l.unitPriceMinor,
      purpose: l.purpose,
      requestId: l.requestId,
      legacySubscriptionId: l.legacySubscriptionId,
      free,
      keysInStore,
      openTasksWithoutKey,
      beneficiaries,
      chargedExcess,
      grantable: Math.max(0, Math.min(free, keysInStore - openTasksWithoutKey)),
      excessGrantable: excessGrantableOf({
        licenseCount: l.licenseCount,
        beneficiaries,
        chargedExcess,
      }),
    };
  }
}
