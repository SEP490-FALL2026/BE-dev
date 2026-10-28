import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogService } from '../../catalog/catalog.service';
import type { OpenSeatHolding, OpenSeatHoldings, SeatOccupancyReader } from '../../catalog/catalog.types';
import { AssignmentRepo } from './assignment.repo';

/**
 * What the catalog may ask of the seats this module holds (ADR-0013 item 4): how many seats a subscription has taken, how many
 * people hold a seat on some plans, and which assignments those are. It hands itself to the catalog when the module
 * starts, so the catalog never imports licensing. An assignment holds a seat from the day it is made until it ends or
 * fails, those waiting for their task included (`BR-10.4`).
 */
@Injectable()
export class AssignmentSeatOccupancy implements SeatOccupancyReader, OnModuleInit {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly catalog: CatalogService,
  ) {}

  onModuleInit(): void {
    this.catalog.registerSeatOccupancy(this);
  }

  occupiedBySubscription(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<number> {
    return this.repo.countHolding(subscriptionId, day, tx);
  }

  openHolderCount(planIds: readonly string[], day: BusinessDate): Promise<number> {
    return this.repo.countHoldersOfPlans(planIds, day);
  }

  subscriptionsWithOpenSeats(
    subscriptionIds: readonly string[],
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<ReadonlySet<string>> {
    return this.repo.subscriptionIdsHolding(subscriptionIds, day, tx);
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
