import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { LockedPlan } from '../plan/plan-facts.service';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { assertQuantityNotBelowOccupied } from './seat-guard.policy';
import { SubscriptionPoolService, type PoolChangeInput } from './pool/subscription-pool.service';
import type { SubscriptionRecord, SubscriptionState } from './subscription.types';

/** What a change of a subscription asks of the others: the organization it is written for, and the seats that hold the quantity up (`US-04-03` AC-5). */
@Injectable()
export class SubscriptionChangeGuard {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly occupancy: SeatOccupancyHook,
    private readonly poolRules: SubscriptionPoolService,
  ) {}

  async requireOrganizationId(): Promise<string> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('Subscriptions were used before installation');

    return organization.id;
  }

  /** The person named to answer for the subscription works, holds the IT Admin role and can sign in (an unlocked read, before the transaction). */
  async requireResponsible(employeeId: string | undefined): Promise<void> {
    if (employeeId !== undefined) await this.poolRules.requireItAdmin(employeeId);
  }

  /** The rules of the shared pool on the state a change leaves (`QĐ-103e`): see `SubscriptionPoolService.judgeChange`. */
  judgePool(
    tx: DbTx,
    change: { plan: LockedPlan; current: SubscriptionRecord; state: SubscriptionState; input: PoolChangeInput },
  ): Promise<void> {
    return this.poolRules.judgeChange(tx, change);
  }

  /**
   * A number of seats under the one bought is checked against the assignments that hold a seat, under the lock of the
   * subscription that every writer of its seats holds, so a grant at the same moment cannot slip past (`US-04-03` AC-5).
   */
  async assertNotBelowOccupied(
    tx: DbTx,
    subscriptionId: string,
    current: number | null,
    requested: number | undefined,
  ): Promise<void> {
    if (requested === undefined || current === null || requested >= current) return;
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const occupied = await this.occupancy.get().occupiedBySubscription(subscriptionId, today, tx);
    assertQuantityNotBelowOccupied({ requested, occupied });
  }
}
