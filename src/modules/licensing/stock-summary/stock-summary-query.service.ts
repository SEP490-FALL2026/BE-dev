import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { StockPlan } from '../../catalog/public/catalog.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentRepo } from '../assignment/assignment.repo';
import { LicenseKeyRepo } from '../license-key/license-key.repo';
import { SharedPoolCapacityRepo } from '../shared-pool/shared-pool-capacity.repo';
import { stockOfPlan } from './stock-summary.policy';
import type { StockSummaryRow } from './stock-summary.types';

const subscriptionIdsOf = (plans: readonly StockPlan[], type: StockPlan['provisioningType']): string[] =>
  plans
    .filter((plan) => plan.provisioningType === type)
    .flatMap((plan) => plan.subscriptions.map((subscription) => subscription.subscriptionId));

/**
 * What the plans hold, by what they give out (`QĐ-111n`): seats of a K2 plan, keys of a K4 plan, the rights of a K1 plan, one row for each plan
 * and never one for each subscription record. A page of plans is cut and counted in one snapshot of the catalog; what is held of the whole
 * page is then read with one statement for each kind, so the number of statements does not grow with the number of plans.
 */
@Injectable()
export class StockSummaryQueryService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly seats: SharedPoolCapacityRepo,
    private readonly keys: LicenseKeyRepo,
    private readonly assignments: AssignmentRepo,
  ) {}

  /** One page of plans by application then plan; `callerEmployeeId` with `mine` keeps the plans (and the subscriptions) the caller answers for. */
  async list(
    query: { mine?: boolean; planId?: string; page: number; pageSize: number },
    callerEmployeeId: string,
  ): Promise<Page<StockSummaryRow>> {
    const today = await this.organizationReads.businessToday();
    const { items: plans, total } = await this.catalog.getStockPlans({
      today,
      ...(query.mine ? { responsibleItAdminEmployeeId: callerEmployeeId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const [seats, keys, holders] = await Promise.all([
      this.seats.occupancyOfMany(subscriptionIdsOf(plans, 'K2'), today),
      this.keys.countsOfSubscriptions(subscriptionIdsOf(plans, 'K4')),
      this.assignments.countHoldingOfSubscriptions(subscriptionIdsOf(plans, 'K1'), today),
    ]);

    return pageOf(
      plans.map((plan) => ({
        plan: {
          planId: plan.planId,
          planName: plan.planName,
          provisioningType: plan.provisioningType,
          applicationId: plan.applicationId,
          applicationName: plan.applicationName,
          logoUrl: plan.applicationLogoUrl,
        },
        stock: stockOfPlan(plan, { seats, keys, holders }),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }
}
