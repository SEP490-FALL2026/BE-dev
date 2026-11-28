import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { type EndEventKind } from '../alerts/renewal-adjustment-alerts.policy';
import { SubscriptionRenewalLinesService } from '../lines/subscription-renewal-lines.service';
import type { RenewalPeople } from '../subscription-renewal-parties.service';

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
 * `QĐ-103v`(9), `US-11-04`): delegates cutoff target locking, automatic renewal/expiry handling, and expired-period line closure to `SubscriptionRenewalLinesService`.
 */
@Injectable()
export class RenewalDeadlineService {
  constructor(private readonly lines: SubscriptionRenewalLinesService) {}

  /** Locks line targets as `SYSTEM` once `today > adjustment.deadline`; false when not due or already locked. */
  lockCutoffIfDue(subject: {
    period: RenewalPeriodFacts;
    adjustment: PeriodAdjustment;
    today: BusinessDate;
  }): Promise<boolean> {
    return this.lines.lockCutoffIfDue(subject);
  }

  /** Closes live lines `ENDED` quietly without creating a deadline event or alert. */
  closeExpiredPeriod(subject: { period: RenewalPeriodFacts; adjustment: PeriodAdjustment }): Promise<boolean> {
    return this.lines.closeExpiredPeriod(subject);
  }

  /** Records the passed renewal day (`autoRenew` -> system renewal + incident, `!autoRenew` -> expiry + close lines `ENDED`). */
  recordPassedRenewalDay(subject: DeadlineSubject): Promise<boolean> {
    return this.lines.handlePassedRenewalDay(subject);
  }
}
