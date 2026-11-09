import { Injectable } from '@nestjs/common';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SharedPoolService } from '../shared-pool/shared-pool.service';
import type { PlanStock } from './licensing-pool-stock.types';

/** The licensing facade for what the shared pool of a plan holds, for a module that shows it beside the work that draws on it (`P2-03`). */
@Injectable()
export class LicensingPoolStockApi {
  constructor(
    private readonly pool: SharedPoolService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /**
   * The stock of each of these plans today, in a fixed number of reads whatever their number: only a K2 plan (seats) or a K4 plan (keys) has a
   * pool, any other kind is `NONE` with nothing counted. A plan that does not exist is absent.
   */
  async getStockOfPlans(planIds: readonly string[]): Promise<Map<string, PlanStock>> {
    return this.pool.stockOfPlans(planIds, await this.organizationReads.businessToday());
  }
}
