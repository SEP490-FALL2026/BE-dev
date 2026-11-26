import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SharedPoolService } from '../shared-pool/shared-pool.service';
import type { PlanStock } from './licensing.types';

export interface PlanVendorChargeContext {
  today: BusinessDate;
  free: number;
  commitmentTermMonths: 1 | 12 | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null;
  renewalDate: BusinessDate | null;
  endDate: BusinessDate | null;
  monthlyUnitPriceMinor: bigint;
  minimumSeats: number | null;
  seatsToday: number;
}

/** The licensing facade for what the shared pool of a plan holds, for a module that shows it beside the work that draws on it (`P2-03`). */
@Injectable()
export class LicensingPoolStockApi {
  constructor(
    private readonly pool: SharedPoolService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly periods: SubscriptionPeriodApi,
  ) {}

  /**
   * The stock of each of these plans today, in a fixed number of reads whatever their number: only a K2 plan (seats) or a K4 plan (keys) has a
   * pool, any other kind is `NONE` with nothing counted. A plan that does not exist is absent.
   */
  async getStockOfPlans(planIds: readonly string[]): Promise<Map<string, PlanStock>> {
    return this.pool.stockOfPlans(planIds, await this.organizationReads.businessToday());
  }

  /** Returns pool + chosen line context for `vendorChargeUntilRenewal` on a K2 plan when `free === 0`. */
  async getVendorChargeContext(planId: string): Promise<PlanVendorChargeContext | null> {
    const [target] = await this.catalog.findPlanSeatTargets([planId]);
    if (target?.provisioningType !== 'K2') return null;

    const today = await this.organizationReads.businessToday();
    const context = await this.pool.chosenK2LineContext(planId, today);
    if (!context || context.free > 0 || !context.chosen) return null;

    const [period] = await this.periods.getPurchaseFacts([context.chosen.subscriptionId]);
    if (!period) return null;

    return {
      today,
      free: context.free,
      commitmentTermMonths: period.commitmentTermMonths,
      billingCycle: period.billingCycle,
      renewalDate: period.renewalDate,
      endDate: period.endDate,
      monthlyUnitPriceMinor: context.chosen.monthlyUnitPriceMinor,
      minimumSeats: context.chosen.minimumSeats,
      seatsToday: context.chosen.seatsToday,
    };
  }
}
