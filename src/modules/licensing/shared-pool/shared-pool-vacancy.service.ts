import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { SharedPoolVacancy } from '../public/licensing-ghost-seat.types';
import { SharedPoolCapacityRepo } from './shared-pool-capacity.repo';

/**
 * The seats bought and taken of every subscription that grants seats on a day (`INV-01`): two reads however many subscriptions
 * there are, the catalog for the subscriptions that grant (active, not taken over by a later period, not ended) and the seats each
 * holds, counted the way the shared pool counts them (`SharedPoolCapacityRepo`: the most assignments held on any day from `asOf` on),
 * so a free seat of a wasted-seat rule is a free seat of the pool.
 */
@Injectable()
export class SharedPoolVacancyService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly capacity: SharedPoolCapacityRepo,
  ) {}

  async vacanciesOn(asOf: BusinessDate, tx?: DbTx): Promise<SharedPoolVacancy[]> {
    const subscriptions = await this.catalog.getSubscriptionsGrantingOn(asOf, tx);
    const ids = subscriptions.map((subscription) => subscription.subscriptionId);
    const occupancy = tx
      ? await this.capacity.occupancyOf(tx, ids, asOf)
      : await this.capacity.occupancyOfMany(ids, asOf);

    return subscriptions.map((subscription) => {
      const taken = occupancy.get(subscription.subscriptionId)?.occupied ?? 0;

      return {
        subscriptionId: subscription.subscriptionId,
        planId: subscription.planId,
        applicationId: subscription.applicationId,
        provisioningType: subscription.provisioningType,
        pricingModel: subscription.pricingModel,
        purchased: subscription.purchasedQuantity,
        occupied: taken,
        free: subscription.purchasedQuantity === null ? null : Math.max(0, subscription.purchasedQuantity - taken),
      };
    });
  }
}
