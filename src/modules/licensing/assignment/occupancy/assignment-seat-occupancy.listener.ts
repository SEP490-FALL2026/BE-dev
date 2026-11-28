import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import { SeatOccupancyHook, type SeatOccupancyReader } from '../../../catalog/public/catalog.extension-points';
import type { OpenSeatHolding, OpenSeatHoldings } from '../../../catalog/public/catalog.types';
import { LicenseLotApi } from '../../../catalog/public/license-lot.api';
import { DeviceActivationRepo } from '../../device-activation/device-activation.repo';
import { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { SharedPoolCapacityRepo } from '../../shared-pool/shared-pool-capacity.repo';
import { AssignmentRepo } from '../assignment.repo';

/**
 * What the catalog may ask of the seats this module holds (ADR-0013 item 4): how many seats a subscription has taken, how many
 * people hold a seat on some plans, and which assignments those are. It binds itself to the catalog's hook when the module
 * starts, so the catalog never imports licensing. An assignment holds a seat from the day it is made until it ends or
 * fails, those waiting for their task included (`BR-10.4`). The licenses of a lot of a K4 plan are counted once, by the lot: the database function behind
 * `occupiedBySubscription` already counts the keys given to people and the old rights with no key, so the assignments are not added for a lot (DL-2).
 */
@Injectable()
export class AssignmentSeatOccupancy implements SeatOccupancyReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [SeatOccupancyHook] as const;

  constructor(
    private readonly repo: AssignmentRepo,
    private readonly capacity: SharedPoolCapacityRepo,
    private readonly deviceActivations: DeviceActivationRepo,
    private readonly lots: LicenseLotApi,
    private readonly hook: SeatOccupancyHook,
    private readonly audit: AuditApi,
    private readonly gate: GrantRequestGateHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  async occupiedBySubscription(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<number> {
    const deviceOccupied = await this.deviceActivations.occupiedBySubscription(subscriptionId, tx);
    if ((await this.lots.idsOfLots([subscriptionId], tx)).has(subscriptionId)) return deviceOccupied;

    return (await this.repo.countHolding(subscriptionId, day, tx)) + deviceOccupied;
  }

  occupiedBySubscriptionPlans(
    subscriptionIds: readonly string[],
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<ReadonlyMap<string, number>> {
    return this.repo.countOccupyingBySubscriptionPlans(subscriptionIds, day, tx);
  }

  keyCountsOfLots(
    lotIds: readonly string[],
    tx?: DbTx,
  ): Promise<ReadonlyMap<string, { inStore: number; assigned: number; withdrawn: number }>> {
    return this.deviceActivations.keyCountsOfLots(lotIds, tx);
  }

  async hasLotBeenUsed(lotId: string, tx?: DbTx): Promise<boolean> {
    if (await this.deviceActivations.hasLotKeyHistory(lotId, tx)) return true;
    if (tx) {
      const keyIds = await this.deviceActivations.lotKeyIds(lotId, tx);
      if (keyIds.length > 0) {
        const events = await this.audit.pageOfResources(
          tx,
          keyIds.map((id) => ({ type: 'LicenseKey', id })),
          { actions: ['LICENSE_KEY.ASSIGNED'], onlySubject: null, skip: 0, take: 1 },
        );
        if (events.total > 0) return true;
      }
    }
    return this.gate.get().hasLotCharges(lotId, tx);
  }

  openGrantTasksWithoutKeyOfPlans(planIds: readonly string[], tx?: DbTx) {
    return this.deviceActivations.openGrantTasksWithoutKeyOfPlans(planIds, tx);
  }

  openHolderCount(planIds: readonly string[], day: BusinessDate): Promise<number> {
    return this.repo.countHoldersOfPlans(planIds, day);
  }

  async subscriptionsWithOpenSeats(
    subscriptionIds: readonly string[],
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<ReadonlySet<string>> {
    const seatSubs = await this.repo.subscriptionIdsHolding(subscriptionIds, day, tx);
    const activationOccupied = await this.deviceActivations.occupiedBySubscriptions(subscriptionIds, tx);

    return new Set([...seatSubs, ...activationOccupied.keys()]);
  }

  async seatsOfSubscriptions(
    subscriptionIds: readonly string[],
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<ReadonlyMap<string, { occupied: number; inRevocation: number }>> {
    const seatMap = tx
      ? await this.capacity.occupancyOf(tx, subscriptionIds, day)
      : await this.capacity.occupancyOfMany(subscriptionIds, day);

    return this.mergeActivationOccupancy(seatMap, subscriptionIds, tx);
  }

  async seatsAndPlansOfSubscriptions(
    subscriptionIds: readonly string[],
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<{
    bySubscription: ReadonlyMap<string, { occupied: number; inRevocation: number }>;
    bySubscriptionPlan: ReadonlyMap<string, number>;
  }> {
    const { bySubscription, bySubscriptionPlan } = await this.capacity.occupancyWithPlansOfMany(
      subscriptionIds,
      day,
      tx,
    );

    return {
      bySubscription: await this.mergeActivationOccupancy(bySubscription, subscriptionIds, tx),
      bySubscriptionPlan,
    };
  }

  private async mergeActivationOccupancy(
    seatMap: ReadonlyMap<string, { occupied: number; inRevocation: number }>,
    subscriptionIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, { occupied: number; inRevocation: number }>> {
    const activationOccupied = await this.deviceActivations.occupiedBySubscriptions(subscriptionIds, tx);
    const candidateLotIds = [...new Set([...activationOccupied.keys(), ...seatMap.keys()])];
    const lotIds = candidateLotIds.length > 0 ? await this.lots.idsOfLots(candidateLotIds, tx) : new Set<string>();
    const merged = new Map(seatMap);
    for (const lotId of lotIds) {
      const current = merged.get(lotId);
      // A lot is counted by the lot alone; once its keys return to store (`0` open keys), never fall back to `seatMap` (DL-2).
      merged.set(lotId, { inRevocation: current?.inRevocation ?? 0, occupied: activationOccupied.get(lotId) ?? 0 });
    }
    for (const [subId, extra] of activationOccupied) {
      if (lotIds.has(subId)) continue;
      const current = merged.get(subId);
      merged.set(subId, { inRevocation: current?.inRevocation ?? 0, occupied: (current?.occupied ?? 0) + extra });
    }

    return merged;
  }

  async openAssignmentsOfPlans(
    planIds: readonly string[],
    day: BusinessDate,
    limit: number,
    tx?: DbTx,
  ): Promise<OpenSeatHoldings> {
    const { items, byPlan } = await this.repo.holdingOfPlans(planIds, day, limit, tx);

    return {
      items: items.map((row): OpenSeatHolding => ({
        assignmentId: row.id,
        employeeId: row.employeeId,
        planId: row.planId,
        subscriptionId: row.subscriptionId,
      })),
      total: byPlan.reduce((sum, plan) => sum + plan.count, 0),
      byPlan,
    };
  }
}
