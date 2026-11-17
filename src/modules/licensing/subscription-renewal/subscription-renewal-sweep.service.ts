import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RenewalUsageContributions } from '../public/licensing.extension-points';
import { RenewalAlertsService } from './alerts/renewal-alerts.service';
import { RenewalDeadlineService } from './deadline/renewal-deadline.service';
import { RenewalPartiesService } from './subscription-renewal-parties.service';
import { SubscriptionRenewalRepo } from './subscription-renewal.repo';

/**
 * How far back a pass still looks at a milestone that passed: a pass that did not run for that long (the API stopped) still flags
 * a late case and records a passed milestone; older periods are left alone rather than given an event long after.
 */
const LOOKBACK_DAYS = 60;

/**
 * The days before the milestone the alerts of the old rule fall: the parameter that held them is gone (S20-T9a), and the sweep that read it
 * is rewritten around the point of adjustment (S20-T6), which drops this constant with the rest of the old rule.
 */
const INTERIM_ALERT_DAYS_BEFORE: readonly number[] = [15, 7];

export interface SweepResult {
  told: number;
  flaggedLate: number;
  deadlineEvents: number;
}

/**
 * One pass over the periods whose milestone is near or just passed (`US-11-01`, `US-11-03`, `US-11-04`): the alerts due today, the
 * late flag of a decided case, the event of a milestone passed with no decision. Every step is idempotent (a person told once, a
 * flag set once, one event per period), so the pass may run again, on several instances, or after a failure.
 */
@Injectable()
export class SubscriptionRenewalSweepService {
  constructor(
    private readonly periods: SubscriptionPeriodApi,
    private readonly repo: SubscriptionRenewalRepo,
    private readonly parties: RenewalPartiesService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly usage: RenewalUsageContributions,
    private readonly alerts: RenewalAlertsService,
    private readonly deadlines: RenewalDeadlineService,
  ) {}

  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = { told: 0, flaggedLate: 0, deadlineEvents: 0 };
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return result;
    const today = await this.organizationReads.businessToday(now);
    const daysBefore = INTERIM_ALERT_DAYS_BEFORE;
    // Until the sweep reads the point of adjustment itself (S20-T6): the K2 periods a department owns, whose milestone falls in the
    // window or has no date at all, as the milestone-window read gave before the shared pool's subscriptions came into the facts.
    const from = addDays(today, -LOOKBACK_DAYS);
    const to = addDays(today, Math.max(0, ...daysBefore));
    const subjects = (await this.periods.listAdjustmentSubjects()).filter(
      (period) =>
        period.ownerDepartmentId !== null &&
        (period.notice.baseDate === null || (period.notice.baseDate >= from && period.notice.baseDate <= to)),
    );
    if (subjects.length === 0) return result;
    const ids = subjects.map((period) => period.subscriptionId);
    const renewals = await this.repo.ofSubscriptions(ids);
    const events = await this.repo.deadlineEventsOf(ids);
    const shared = await this.parties.sharedPeople();
    const usageAvailable = this.usage.all().length > 0;

    for (const period of subjects) {
      const people = await this.parties.peopleOf(period, shared);
      // Until the sweep reads the case of the period itself (S20-T6): the latest live case of the subscription.
      const renewal = renewals.get(period.subscriptionId)?.at(-1) ?? null;
      const base = { organizationId: organization.id, today, period, renewal, people };
      result.told += await this.alerts.sendDue({ ...base, daysBefore, usageAvailable });
      if (await this.deadlines.flagLateIfDue({ ...base, now, hasDeadlineEvent: events.has(period.subscriptionId) })) {
        result.flaggedLate += 1;
      }
      if (
        await this.deadlines.recordPassedMilestone({
          ...base,
          now,
          hasDeadlineEvent: events.has(period.subscriptionId),
        })
      ) {
        result.deadlineEvents += 1;
      }
    }

    return result;
  }
}
