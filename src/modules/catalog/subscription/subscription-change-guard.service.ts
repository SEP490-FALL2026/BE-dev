import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../organization/public/organization.api';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { assertQuantityNotBelowOccupied } from './seat-guard.policy';

/** What a change of a subscription asks of the others: the organization it is written for, and the seats that hold the quantity up (`US-04-03` AC-5). */
@Injectable()
export class SubscriptionChangeGuard {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly occupancy: SeatOccupancyHook,
  ) {}

  async requireOrganizationId(): Promise<string> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('Subscriptions were used before installation');

    return organization.id;
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
    const today = await this.organization.businessToday(new Date(), tx);
    const occupied = await this.occupancy.get().occupiedBySubscription(subscriptionId, today, tx);
    assertQuantityNotBelowOccupied({ requested, occupied });
  }
}
