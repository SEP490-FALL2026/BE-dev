import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SeatOccupancyHook, type SeatOccupancyReader } from '../../../catalog/public/catalog.extension-points';
import type { OpenSeatHolding, OpenSeatHoldings } from '../../../catalog/public/catalog.types';
import { DeviceActivationRepo } from '../../device-activation/device-activation.repo';
import { SharedPoolCapacityRepo } from '../../shared-pool/shared-pool-capacity.repo';
import { AssignmentRepo } from '../assignment.repo';

/**
 * What the catalog may ask of the seats this module holds (ADR-0013 item 4): how many seats a subscription has taken, how many
 * people hold a seat on some plans, and which assignments those are. It binds itself to the catalog's hook when the module
 * starts, so the catalog never imports licensing. An assignment holds a seat from the day it is made until it ends or
 * fails, those waiting for their task included (`BR-10.4`).
 */
@Injectable()
export class AssignmentSeatOccupancy implements SeatOccupancyReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [SeatOccupancyHook] as const;

  constructor(
    private readonly repo: AssignmentRepo,
    private readonly capacity: SharedPoolCapacityRepo,
    private readonly deviceActivations: DeviceActivationRepo,
    private readonly hook: SeatOccupancyHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  async occupiedBySubscription(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<number> {
    const seats = await this.repo.countHolding(subscriptionId, day, tx);
    const deviceOccupied = await this.deviceActivations.occupiedBySubscription(subscriptionId, tx);

    return seats + deviceOccupied;
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
    const activationOccupied = await this.deviceActivations.occupiedBySubscriptions(subscriptionIds, tx);
    const merged = new Map(seatMap);
    for (const [subId, extra] of activationOccupied) {
      const current = merged.get(subId);
      merged.set(
        subId,
        current ? { ...current, occupied: current.occupied + extra } : { occupied: extra, inRevocation: 0 },
      );
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
