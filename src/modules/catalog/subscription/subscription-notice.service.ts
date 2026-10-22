import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
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
  /** The earliest alert date: the base date minus the largest number of days of the parameter. */
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
    private readonly parameters: OperatingParametersService,
  ) {}

  async activeNotices(planId?: string): Promise<ActiveNotice[]> {
    const value = await this.parameters.getValue('RENEWAL_ALERT_DAYS_BEFORE_DEADLINE');
    const daysBefore = Array.isArray(value) ? value : [];
    if (daysBefore.length === 0) return [];
    const earliest = Math.max(...daysBefore);

    const notices: ActiveNotice[] = [];
    for (const record of await this.subscriptions.listActiveTerms(planId)) {
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
        firstAlertDate: addDays(notice.baseDate, -earliest),
      });
    }

    return notices;
  }
}
