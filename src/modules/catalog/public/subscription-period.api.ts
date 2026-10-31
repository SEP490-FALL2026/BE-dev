import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ApplicationLookupService } from '../catalog-entry/application-lookup.service';
import { SubscriptionPeriodService } from '../subscription/subscription-period.service';
import type { NextPeriodInput, RenewalPeriodFacts } from './subscription-period.types';

/**
 * The periods of the subscriptions as the renewal of a subscription (licensing, EP-11) reads and continues them: the milestone,
 * the price, the seats bought and the chain of periods (`QĐ-16`). The renewal decides nothing here; the catalog only records the
 * new period the IT Admin reports from the vendor, chained to the old one.
 */
@Injectable()
export class SubscriptionPeriodApi {
  constructor(
    private readonly periods: SubscriptionPeriodService,
    private readonly applications: ApplicationLookupService,
  ) {}

  /** The periods with these ids, in one read; an id that does not exist is absent. */
  getPeriods(subscriptionIds: readonly string[], tx?: DbTx): Promise<RenewalPeriodFacts[]> {
    return this.periods.facts(subscriptionIds, tx);
  }

  /** The period locked `FOR UPDATE` until the caller's transaction ends, the lock its seats are counted under; null if absent. */
  lockPeriod(tx: DbTx, subscriptionId: string): Promise<RenewalPeriodFacts | null> {
    return this.periods.lock(tx, subscriptionId);
  }

  /** The active terms not yet continued whose milestone falls between two days, and those that have no milestone at all. */
  listRenewalSubjects(window: { from: BusinessDate; to: BusinessDate }): Promise<RenewalPeriodFacts[]> {
    return this.periods.subjects(window);
  }

  /**
   * Records the period the vendor confirmed as the continuation of an old one, in the caller's transaction, chained once (`QĐ-16`).
   * Throws SubscriptionPeriodRefusedError with nothing written.
   */
  recordNextPeriod(tx: DbTx, actor: AuthenticatedPrincipal, input: NextPeriodInput): Promise<RenewalPeriodFacts> {
    return this.periods.recordNext(tx, actor, input);
  }

  /** The Business Owner of the application who receives its renewal alerts, or null when they have left (`BR-06.7`). */
  getRenewalAlertRecipient(applicationId: string): Promise<string | null> {
    return this.applications.renewalAlertRecipient(applicationId);
  }
}
