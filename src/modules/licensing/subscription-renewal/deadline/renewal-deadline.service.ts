import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import type { RenewalPeople } from '../subscription-renewal-parties.service';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type { RenewalRecord } from '../subscription-renewal.types';
import { deadlineOutcomeOf, lateFlagDue } from './renewal-deadline.policy';

/** What one pass knows of a period when it looks at its milestone. */
export interface DeadlineSubject {
  organizationId: string;
  today: BusinessDate;
  now: Date;
  period: RenewalPeriodFacts;
  renewal: RenewalRecord | null;
  hasDeadlineEvent: boolean;
  people: RenewalPeople;
}

/**
 * What the milestone of a period records once reached (`US-11-03` AC-13, AC-14, AC-20, `US-11-04` AC-1 → AC-9): a decision taken by
 * then without an outcome flags the case late and tells the IT Admin and the decider — not an incident; with no decision by then, a
 * subscription that renews itself has an incident (counted by `KPI-4`) and the IT Admin and the decider are told, one that does not
 * is marked to end and the IT Admin is told. Once per period and case; the system never renews, cancels or decides anything.
 */
@Injectable()
export class RenewalDeadlineService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly notifier: RenewalNotifier,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Flags the case late when due; true when it was flagged now. */
  async flagLateIfDue(subject: DeadlineSubject): Promise<boolean> {
    const { renewal, period, people } = subject;
    const baseDate = period.notice.baseDate;
    if (!renewal?.decision || baseDate === null) return false;
    const due = lateFlagDue({
      today: subject.today,
      baseDate,
      decided: true,
      decidedAfterDeadline: renewal.decision.decidedAfterDeadline,
      outcomeRecorded: renewal.outcome !== null,
      alreadyFlagged: renewal.lateFlaggedAt !== null,
    });
    if (!due) return false;
    const decision = renewal.decision;

    return this.runner.run(async (tx) => {
      if (!(await this.repo.flagLate(tx, renewal.id, subject.now))) return false;
      await this.audit.record(tx, {
        organizationId: subject.organizationId,
        actorKind: 'SYSTEM',
        action: 'SUBSCRIPTION_RENEWAL.FLAGGED_LATE',
        resourceType: 'SubscriptionRenewal',
        resourceId: renewal.id,
        before: null,
        after: { subscriptionId: period.subscriptionId, baseDate, decidedOn: decision.decidedOn },
        correlationId: renewal.id,
      });
      await this.notifier.tell(tx, {
        organizationId: subject.organizationId,
        recipients: [
          renewal.proposedByEmployeeId,
          ...(people.itAdmin ? [people.itAdmin] : []),
          decision.decidedByEmployeeId,
        ],
        code: 'SUBSCRIPTION_RENEWAL_LATE',
        subject: { type: 'SUBSCRIPTION_RENEWAL', id: renewal.id },
        params: { renewalId: renewal.id, subscriptionId: period.subscriptionId, baseDate },
        eventKey: `subscription-renewal-late:${renewal.id}`,
      });

      return true;
    });
  }

  /** Records the event of a milestone passed with no decision by it, when due; true when it was recorded now. */
  async recordPassedMilestone(subject: DeadlineSubject): Promise<boolean> {
    const { period, people } = subject;
    const baseDate = period.notice.baseDate;
    if (baseDate === null) return false;
    const kind = deadlineOutcomeOf({
      today: subject.today,
      baseDate,
      autoRenew: period.autoRenew,
      decidedOn: subject.renewal?.decision?.decidedOn ?? null,
      alreadyRecorded: subject.hasDeadlineEvent,
    });
    if (kind === null) return false;

    return this.runner.run(async (tx) => {
      const event = await this.repo.insertDeadlineEvent(tx, {
        organizationId: subject.organizationId,
        subscriptionId: period.subscriptionId,
        kind,
        noticeBaseDate: baseDate,
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
        after: { baseDate, autoRenew: period.autoRenew, endDate: period.endDate, reason: 'NO_DECISION_BY_MILESTONE' },
        correlationId: event.id,
      });
      await this.notifier.tell(tx, {
        organizationId: subject.organizationId,
        recipients: [
          ...(people.itAdmin ? [people.itAdmin] : []),
          ...(incident && people.approver ? [people.approver] : []),
        ],
        code: incident ? 'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT' : 'SUBSCRIPTION_EXPIRY_MARKED',
        subject: { type: 'SUBSCRIPTION', id: period.subscriptionId },
        params: incident
          ? { subscriptionId: period.subscriptionId, baseDate }
          : { subscriptionId: period.subscriptionId, baseDate, endDate: period.endDate },
        eventKey: `subscription-deadline-event:${period.subscriptionId}`,
      });

      return true;
    });
  }
}
