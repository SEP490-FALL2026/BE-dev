import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApplicationFactsService } from '../catalog-entry/application-facts.service';
import { SubscriptionPeriodService } from '../subscription/period/subscription-period.service';
import type {
  NextPeriodInput,
  PaymentScheduleFacts,
  PeriodAuditActor,
  PoolAdjustmentWindows,
  RenewalPeriodFacts,
  SubscriptionPurchaseFacts,
} from './subscription-period.types';

/**
 * The periods of the subscriptions as the renewal of a subscription (licensing, EP-11) reads and continues them: the milestone,
 * the price, the seats bought and the chain of periods (`QĐ-16`). The renewal decides nothing here; the catalog only records the
 * new period the IT Admin reports from the vendor, chained to the old one.
 */
@Injectable()
export class SubscriptionPeriodApi {
  constructor(
    private readonly periods: SubscriptionPeriodService,
    private readonly applications: ApplicationFactsService,
  ) {}

  /** The periods with these ids, in one read; an id that does not exist is absent. */
  getPeriods(subscriptionIds: readonly string[], tx?: DbTx): Promise<RenewalPeriodFacts[]> {
    return this.periods.facts(subscriptionIds, tx);
  }

  /**
   * What a purchase invoice reads of the subscriptions with these ids, in one read: of every one, the shared pool's included (`getPeriods` leaves
   * those out); an id that does not exist is absent.
   */
  getPurchaseFacts(subscriptionIds: readonly string[], tx?: DbTx): Promise<SubscriptionPurchaseFacts[]> {
    return this.periods.purchaseFacts(subscriptionIds, tx);
  }

  /** Adjustment windows active for each subscription's period running on `referenceDay`. */
  adjustmentWindowsOf(
    subscriptionIds: readonly string[],
    referenceDay: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, PoolAdjustmentWindows>> {
    return this.periods.adjustmentWindowsOf(subscriptionIds, referenceDay, tx);
  }

  /** Earliest effective date on which a seat reduction asked on `day` can take effect for `subscriptionId`, or null. */
  earliestReducibleOn(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<BusinessDate | null> {
    return this.periods.earliestReducibleOnFor(subscriptionId, day, tx);
  }

  /** The ids of the subscriptions this IT Admin answers for (`responsibleItAdminEmployeeId`). */
  getResponsibleSubscriptionIds(employeeId: string, tx?: DbTx): Promise<string[]> {
    return this.periods.idsResponsibleFor(employeeId, tx);
  }

  /** The period locked `FOR UPDATE` until the caller's transaction ends, the lock its seats are counted under; null if absent. */
  lockPeriod(tx: DbTx, subscriptionId: string): Promise<RenewalPeriodFacts | null> {
    return this.periods.lock(tx, subscriptionId);
  }

  /**
   * The active K2 terms (the shared pool's workspaces) not yet continued, at most 500: the periods that have a point of adjustment
   * (`SBF-20`). Each carries its `adjustment`, null when no date gives one.
   */
  listAdjustmentSubjects(): Promise<RenewalPeriodFacts[]> {
    return this.periods.adjustmentSubjects();
  }

  /**
   * The subscriptions that run a period, with the days their payments follow, for the periods that have no invoice (`PI-2`). A purchase made once and a draft are not among them.
   */
  listPaymentSchedules(tx?: DbTx): Promise<PaymentScheduleFacts[]> {
    return this.periods.paymentSchedules(tx);
  }

  /**
   * Records the period the vendor confirmed as the continuation of an old one, in the caller's transaction, chained once (`QĐ-16`).
   * Throws SubscriptionPeriodRefusedError with nothing written.
   */
  recordNextPeriod(tx: DbTx, actor: PeriodAuditActor, input: NextPeriodInput): Promise<RenewalPeriodFacts> {
    return this.periods.recordNext(tx, actor, input);
  }

  /** Closes all still-live lines of `subscriptionId` as `ENDED` on `closedOn` when a term expires without renewal. */
  closeExpiredLines(tx: DbTx, subscriptionId: string, closedOn: BusinessDate): Promise<void> {
    return this.periods.closeExpiredLines(tx, subscriptionId, closedOn);
  }

  /** All non-removed or stored lines of `subscriptionId`, oldest first. */
  linesOfSubscription(subscriptionId: string, tx?: DbTx) {
    return this.periods.linesOfSubscription(subscriptionId, tx);
  }

  /** Batch lines of `subscriptionIds`, keyed by subscription id. */
  linesOfSubscriptions(subscriptionIds: readonly string[], tx?: DbTx) {
    return this.periods.linesOfSubscriptions(subscriptionIds, tx);
  }
}
