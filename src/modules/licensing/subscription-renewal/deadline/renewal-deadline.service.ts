import { Injectable, Optional } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { noticeRecipients, type EndEventKind } from '../alerts/renewal-adjustment-alerts.policy';
import { SubscriptionRenewalLinesService } from '../lines/subscription-renewal-lines.service';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import type { RenewalPeople } from '../subscription-renewal-parties.service';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';

/** What one pass knows of a period past its renewal day. */
export interface DeadlineSubject {
  organizationId: string;
  today: BusinessDate;
  period: RenewalPeriodFacts;
  adjustment: PeriodAdjustment;
  kind: EndEventKind;
  people: RenewalPeople;
}

/**
 * What the renewal day of a period records once it has passed with no outcome recorded and seats still held (`SBF-20` §4.5, `QĐ-103e`,
 * `QĐ-103v`(9), `US-11-04`): a period that renews itself has an incident (counted by `KPI-4`) and the IT Admin, Finance and the person who
 * decides spending are told (`QĐ-99h`); one that does not is marked *expired without renewal* and the IT Admin and Finance are told (`QĐ-98e`).
 * One event per period (`noticeBaseDate` is the renewal day); the system never renews, cancels or decides anything.
 */
@Injectable()
export class RenewalDeadlineService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly notifier: RenewalNotifier,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    @Optional() private readonly lines?: SubscriptionRenewalLinesService,
  ) {}

  /** Locks line targets as `SYSTEM` once `today > adjustment.deadline`; false when not due or already locked. */
  lockCutoffIfDue(subject: {
    period: RenewalPeriodFacts;
    adjustment: PeriodAdjustment;
    today: BusinessDate;
  }): Promise<boolean> {
    if (!this.lines) return Promise.resolve(false);

    return this.lines.lockCutoffIfDue(subject);
  }

  /** Closes live lines `ENDED` quietly without creating a deadline event or alert. */
  closeExpiredPeriod(subject: { period: RenewalPeriodFacts; adjustment: PeriodAdjustment }): Promise<boolean> {
    if (!this.lines) return Promise.resolve(false);

    return this.lines.closeExpiredPeriod(subject);
  }

  /** Records the passed renewal day (`autoRenew` -> system renewal + incident, `!autoRenew` -> expiry + close lines `ENDED`). */
  async recordPassedRenewalDay(subject: DeadlineSubject): Promise<boolean> {
    if (this.lines) return this.lines.handlePassedRenewalDay(subject);
    const { period, adjustment, kind } = subject;
    const renewalDay = adjustment.end;

    return this.runner.run(async (tx) => {
      const event = await this.repo.insertDeadlineEvent(tx, {
        organizationId: subject.organizationId,
        subscriptionId: period.subscriptionId,
        kind,
        noticeBaseDate: renewalDay,
        autoRenewAtTime: period.autoRenew,
        recordedOn: subject.today,
      });
      if (!event) return false;
      const incident = kind === 'AUTO_RENEWAL_INCIDENT';
      await this.audit.record(tx, {
        organizationId: subject.organizationId,
        actorKind: 'SYSTEM',
        action: incident ? 'SUBSCRIPTION.AUTO_RENEWAL_INCIDENT' : 'SUBSCRIPTION.EXPIRY_MARKED',
        resourceType: 'Subscription',
        resourceId: period.subscriptionId,
        before: null,
        after: {
          baseDate: renewalDay,
          autoRenew: period.autoRenew,
          endDate: period.endDate,
          reason: 'NO_OUTCOME_BY_RENEWAL_DAY',
        },
        correlationId: event.id,
      });
      await this.notifier.tell(tx, {
        organizationId: subject.organizationId,
        recipients: noticeRecipients(kind, subject.people),
        code: incident ? 'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT' : 'SUBSCRIPTION_EXPIRY_MARKED',
        subject: { type: 'SUBSCRIPTION', id: period.subscriptionId },
        params: incident
          ? { subscriptionId: period.subscriptionId, baseDate: renewalDay, renewalId: null }
          : { subscriptionId: period.subscriptionId, baseDate: renewalDay, endDate: period.endDate },
        eventKey: `${incident ? 'subscription-incident' : 'subscription-expiry'}:${period.subscriptionId}:${renewalDay}`,
      });

      return true;
    });
  }
}
