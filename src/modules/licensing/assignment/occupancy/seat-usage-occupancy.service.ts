import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { LicenseLotApi } from '../../../catalog/public/license-lot.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { DeviceActivationRepo } from '../../device-activation/device-activation.repo';
import { SeatTargetNotFoundError } from '../../public/licensing.errors';
import type { SeatUsage } from '../../public/licensing.types';
import { AssignmentRepo } from '../assignment.repo';

/**
 * The seats of a subscription as the IT Admin reads them: bought, taken and free. Taken are the assignments that occupy a seat today
 * plus the open activations of a lot of keys on machines (the same count the catalog reads through the seat-occupancy hook). A lot of a K4 plan is
 * counted by the lot alone: bought are its licenses, taken what the database counts of it, so no seat is counted twice (DL-2).
 */
@Injectable()
export class SubscriptionSeatUsageService {
  constructor(
    private readonly assignments: AssignmentRepo,
    private readonly deviceActivations: DeviceActivationRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly lots: LicenseLotApi,
  ) {}

  /** The seats bought, taken and free on today in the organization calendar. Throws SeatTargetNotFoundError. */
  async get(subscriptionId: string): Promise<SeatUsage> {
    const target = await this.catalog.findSeatTarget({ subscriptionId });
    if (!target) throw new SeatTargetNotFoundError('SUBSCRIPTION');
    const asOf = await this.organizationReads.businessToday();
    const lot = target.provisioningType === 'K4' ? await this.lots.findLot(subscriptionId) : null;
    const occupied = lot
      ? await this.deviceActivations.occupiedBySubscription(subscriptionId)
      : (await this.assignments.countOccupying(subscriptionId, asOf)) +
        (await this.deviceActivations.occupiedBySubscription(subscriptionId));
    const purchased = lot ? lot.licenseCount : target.purchasedQuantity;

    return {
      subscriptionId,
      purchased,
      occupied,
      free: purchased === null ? null : Math.max(0, purchased - occupied),
      asOf,
    };
  }
}
