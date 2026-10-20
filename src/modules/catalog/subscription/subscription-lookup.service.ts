import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SubscriptionRepo } from './subscription.repo';
import type { SubscriptionKind } from './subscription.types';

/** What the rules of another capability need to know of the subscriptions of some plans: their kind and their end. */
@Injectable()
export class SubscriptionLookupService {
  constructor(private readonly subscriptions: SubscriptionRepo) {}

  /** The subscriptions and perpetual purchases of these plans, oldest first. */
  termsOfPlans(
    planIds: readonly string[],
    tx?: DbTx,
  ): Promise<{ subscriptionId: string; planId: string; kind: SubscriptionKind; endDate: BusinessDate | null }[]> {
    return this.subscriptions.findOfPlans(planIds, tx);
  }
}
