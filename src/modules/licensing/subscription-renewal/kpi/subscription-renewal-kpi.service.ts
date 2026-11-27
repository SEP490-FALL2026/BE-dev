import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { KpiMissedAdjustmentService } from './kpi-missed-adjustment.service';
import type { SubscriptionKpi4Summary } from './subscription-renewal-kpi.types';

/** Group entry for `subscription-renewal/kpi/` (incremental `KPI-4`). */
@Injectable()
export class SubscriptionRenewalKpiService {
  constructor(private readonly missedAdjustment: KpiMissedAdjustmentService) {}

  kpi4ForSubscription(
    subscriptionId: string,
    months: readonly BusinessDate[],
    tx?: DbTx,
  ): Promise<SubscriptionKpi4Summary> {
    return this.missedAdjustment.kpi4ForSubscription(subscriptionId, months, tx);
  }
}
