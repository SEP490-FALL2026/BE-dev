import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { AssignmentService } from '../assignment/assignment.service';
import type { SharedPoolVacancy } from '../public/licensing-ghost-seat.types';

/**
 * The seats bought and taken of every subscription that grants seats on a day (`INV-01`): two reads however many subscriptions
 * there are, the catalog for the subscriptions that grant (active, no later period, not ended) and the seats for how many each
 * holds (every assignment not ended and not failed, the invitations and tasks waiting for their grant included).
 */
@Injectable()
export class SharedPoolVacancyService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly assignments: AssignmentService,
  ) {}

  async vacanciesOn(asOf: BusinessDate, tx?: DbTx): Promise<SharedPoolVacancy[]> {
    const subscriptions = await this.catalog.getSubscriptionsGrantingOn(asOf, tx);
    const occupied = await this.assignments.countHoldingOfSubscriptions(
      subscriptions.map((subscription) => subscription.subscriptionId),
      asOf,
      tx,
    );

    return subscriptions.map((subscription) => {
      const taken = occupied.get(subscription.subscriptionId) ?? 0;

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
