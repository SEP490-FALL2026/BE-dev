import { Injectable, Optional } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicenseLotStockApi } from '../../catalog/public/license-lot-stock.api';
import type { SharedPoolVacancy } from '../public/licensing-ghost-seat.types';
import { SharedPoolCapacityRepo } from './shared-pool-capacity.repo';

/**
 * The seats bought and taken of every subscription that grants seats on a day (`INV-01`) plus free `ACCOUNT` license lots (`W3-26`):
 * subscriptions read catalog + occupancy; K4 `ACCOUNT` lots with `free > 0` come from `LicenseLotStockApi`.
 */
@Injectable()
export class SharedPoolVacancyService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly capacity: SharedPoolCapacityRepo,
    @Optional() private readonly lotStock?: LicenseLotStockApi,
  ) {}

  async vacanciesOn(asOf: BusinessDate, tx?: DbTx): Promise<SharedPoolVacancy[]> {
    const subscriptions = await this.catalog.getSubscriptionsGrantingOn(asOf, tx);
    const ids = subscriptions.map((subscription) => subscription.subscriptionId);
    const occupancy = tx
      ? await this.capacity.occupancyOf(tx, ids, asOf)
      : await this.capacity.occupancyOfMany(ids, asOf);

    const byId = new Map<string, SharedPoolVacancy>();
    for (const subscription of subscriptions) {
      const taken = occupancy.get(subscription.subscriptionId)?.occupied ?? 0;
      byId.set(subscription.subscriptionId, {
        subscriptionId: subscription.subscriptionId,
        planId: subscription.planId,
        applicationId: subscription.applicationId,
        provisioningType: subscription.provisioningType,
        pricingModel: subscription.pricingModel,
        subjectKind: 'SUBSCRIPTION',
        keyBinding: null,
        purchased: subscription.purchasedQuantity,
        occupied: taken,
        free: subscription.purchasedQuantity === null ? null : Math.max(0, subscription.purchasedQuantity - taken),
      });
    }

    if (this.lotStock) {
      for (const lot of await this.lotStock.listAccountVacancies(asOf, tx)) {
        if (lot.free <= 0) continue;
        byId.set(lot.lotId, {
          subscriptionId: lot.lotId,
          planId: lot.planId,
          applicationId: lot.applicationId,
          provisioningType: 'K4',
          pricingModel: lot.pricingModel,
          subjectKind: 'LICENSE_LOT',
          keyBinding: 'ACCOUNT',
          purchased: lot.purchased,
          occupied: lot.occupied,
          free: lot.free,
        });
      }
    }

    return [...byId.values()];
  }
}
