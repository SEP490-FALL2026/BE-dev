import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import type { AdjustmentWindows } from './obligation/subscription-obligation.policy';
import { deriveNotice, noticeInputOf } from './subscription.policy';
import { SubscriptionRepo } from './subscription.repo';
import { ANNUAL_WINDOW_DAYS_MAX, SubscriptionWindowsService } from './subscription-windows.service';

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
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly windows: SubscriptionWindowsService,
  ) {}

  /**
   * The notices whose base date is on or after `today` and within the window of the point of adjustment of a plan by the year, the one of
   * the period of each subscription (`SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL` at its start, `QĐ-106h`): the subscriptions outside that window cannot be
   * due for a review, so they are not returned. Candidates are read up to the widest window the parameter allows, then cut by their own.
   */
  async activeNotices(today: BusinessDate, planId?: string): Promise<ActiveNotice[]> {
    const records = await this.subscriptions.listTermsWithMilestoneBetween(
      today,
      addDays(today, ANNUAL_WINDOW_DAYS_MAX),
      planId,
    );
    const windows = await this.windows.of(records, today);
    const notices: ActiveNotice[] = [];
    for (const record of records) {
      const notice = deriveNotice(noticeInputOf(record));
      if (notice.baseDate === null) continue;
      if (notice.source !== 'DECLARED' && notice.source !== 'INFERRED_UNCONFIRMED' && notice.source !== 'BY_END_DATE') {
        continue;
      }
      const days = (windows.get(record.id) as AdjustmentWindows).annualDays;
      if (notice.baseDate > addDays(today, days)) continue;
      notices.push({
        subscriptionId: record.id,
        planId: record.planId,
        planName: record.planName,
        applicationId: record.applicationId,
        applicationName: record.applicationName,
        noticeDeadline: notice.deadline,
        noticeSource: notice.source,
        baseDate: notice.baseDate,
        firstAlertDate: addDays(notice.baseDate, -days),
      });
    }

    return notices;
  }
}
