import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { ANNUAL_WINDOW_DAYS } from './obligation/subscription-obligation.policy';
import { deriveNotice, noticeInputOf } from './subscription.policy';
import { SubscriptionRepo } from './subscription.repo';

export interface ActiveNotice {
  subscriptionId: string;
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  noticeDeadline: BusinessDate | null;
  noticeSource: 'DECLARED' | 'INFERRED_UNCONFIRMED' | 'BY_END_DATE';
  /** The date the alerts count back from: the deadline, or the end date when there is none. */
  baseDate: BusinessDate;
  /** The earliest alert date: the point of adjustment of a plan by the year, the base date minus its window (`FR-8.2`). */
  firstAlertDate: BusinessDate;
}

/**
 * The milestone of every active term subscription that has one, as other capabilities need it (the review of the terms).
 * It is the same derivation as the subscription's own read, so the two never disagree. A perpetual purchase, a draft and
 * a subscription with no date to alert from have none.
 */
@Injectable()
export class SubscriptionNoticeService {
  constructor(private readonly subscriptions: SubscriptionRepo) {}

  /**
   * The notices whose base date is on or after `today` and within the window of the point of adjustment of a plan by the year: the subscriptions
   * outside that window cannot be due for a review, so they are not read.
   */
  async activeNotices(today: BusinessDate, planId?: string): Promise<ActiveNotice[]> {
    const notices: ActiveNotice[] = [];
    for (const record of await this.subscriptions.listTermsWithMilestoneBetween(
      today,
      addDays(today, ANNUAL_WINDOW_DAYS),
      planId,
    )) {
      const notice = deriveNotice(noticeInputOf(record));
      if (notice.baseDate === null) continue;
      if (notice.source !== 'DECLARED' && notice.source !== 'INFERRED_UNCONFIRMED' && notice.source !== 'BY_END_DATE') {
        continue;
      }
      notices.push({
        subscriptionId: record.id,
        planId: record.planId,
        planName: record.planName,
        applicationId: record.applicationId,
        applicationName: record.applicationName,
        noticeDeadline: notice.deadline,
        noticeSource: notice.source,
        baseDate: notice.baseDate,
        firstAlertDate: addDays(notice.baseDate, -ANNUAL_WINDOW_DAYS),
      });
    }

    return notices;
  }
}
