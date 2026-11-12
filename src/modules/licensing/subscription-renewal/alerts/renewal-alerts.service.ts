import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import type { RenewalPeople } from '../subscription-renewal-parties.service';
import type { RenewalRecord } from '../subscription-renewal.types';
import { alertRecipients, dueMilestone, finalAlertSkipped, type AlertAudience } from './renewal-alerts.policy';

/** What one pass knows of a period when it looks at its alerts. */
export interface AlertSubject {
  organizationId: string;
  today: BusinessDate;
  period: RenewalPeriodFacts;
  renewal: RenewalRecord | null;
  people: RenewalPeople;
  daysBefore: readonly number[];
  usageAvailable: boolean;
}

/**
 * The alerts of the milestones of a renewal (`US-11-01`): at each milestone counted back from the cancellation deadline (or the end
 * date), the IT Admin, Finance and the decider are told, the Super Admin too at the last one,
 * which is left out when the decision and its outcome are both recorded. A period with no milestone gives the IT Admin a warning of
 * the quality of its contract data instead of a guessed date. Each person is told once for a milestone, however often the pass runs, and each notice has its audit event.
 * Usage is only said to be available or not: no recommendation is invented here.
 */
@Injectable()
export class RenewalAlertsService {
  constructor(
    private readonly notifier: RenewalNotifier,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Writes what is due for the period today; returns how many people were told now. */
  async sendDue(subject: AlertSubject): Promise<number> {
    const { period, people } = subject;
    const baseDate = period.notice.baseDate;
    if (baseDate === null) return this.dataQualityWarning(subject);
    const milestone = dueMilestone(baseDate, subject.today, subject.daysBefore);
    if (!milestone) return 0;
    const decided = subject.renewal?.decision != null;
    if (milestone.final && finalAlertSkipped({ decided, outcomeRecorded: subject.renewal?.outcome != null })) return 0;

    return this.runner.run(async (tx) => {
      let told = 0;
      for (const recipient of alertRecipients(people, milestone.final)) {
        told += await this.alert(tx, subject, recipient, { baseDate, days: milestone.days, decided });
      }
      return told;
    });
  }

  private async alert(
    tx: DbTx,
    subject: AlertSubject,
    recipient: { audience: AlertAudience; employeeId: string },
    milestone: { baseDate: BusinessDate; days: number; decided: boolean },
  ): Promise<number> {
    const { period, renewal } = subject;
    const told = await this.notifier.tell(tx, {
      organizationId: subject.organizationId,
      recipients: [recipient.employeeId],
      code: 'SUBSCRIPTION_RENEWAL_ALERT',
      subject: { type: 'SUBSCRIPTION', id: period.subscriptionId },
      params: {
        subscriptionId: period.subscriptionId,
        renewalId: renewal?.id ?? null,
        milestoneDays: milestone.days,
        baseDate: milestone.baseDate,
        noticeBasis: period.notice.source,
        audience: recipient.audience,
        decisionRecorded: milestone.decided,
        outcomeRecorded: renewal?.outcome != null,
        usageData: subject.usageAvailable ? 'AVAILABLE' : 'NOT_AVAILABLE',
      },
      eventKey: `subscription-renewal-alert:${period.subscriptionId}:${milestone.baseDate}:${milestone.days}`,
    });
    if (told.length === 0) return 0;
    await this.audit.record(tx, {
      organizationId: subject.organizationId,
      actorKind: 'SYSTEM',
      action: 'SUBSCRIPTION_RENEWAL.ALERT_SENT',
      resourceType: 'Subscription',
      resourceId: period.subscriptionId,
      before: null,
      after: {
        milestoneDays: milestone.days,
        baseDate: milestone.baseDate,
        noticeBasis: period.notice.source,
        audience: recipient.audience,
        recipientEmployeeId: recipient.employeeId,
      },
      correlationId: period.subscriptionId,
    });

    return 1;
  }

  /** A period with no milestone: the IT Admin is warned once that its contract data must be completed; no date is guessed. */
  private async dataQualityWarning(subject: AlertSubject): Promise<number> {
    const { period, people } = subject;
    if (period.notice.source !== 'MISSING' || people.itAdmin === null) return 0;
    const itAdmin = people.itAdmin;

    return this.runner.run(async (tx) => {
      const told = await this.notifier.tell(tx, {
        organizationId: subject.organizationId,
        recipients: [itAdmin],
        code: 'SUBSCRIPTION_RENEWAL_DATA_QUALITY',
        subject: { type: 'SUBSCRIPTION', id: period.subscriptionId },
        params: { subscriptionId: period.subscriptionId, problem: 'NO_ALERT_ANCHOR' },
        eventKey: `subscription-renewal-data-quality:${period.subscriptionId}`,
      });
      if (told.length > 0) {
        await this.audit.record(tx, {
          organizationId: subject.organizationId,
          actorKind: 'SYSTEM',
          action: 'SUBSCRIPTION_RENEWAL.DATA_QUALITY_WARNED',
          resourceType: 'Subscription',
          resourceId: period.subscriptionId,
          before: null,
          after: { problem: 'NO_ALERT_ANCHOR', recipientEmployeeId: itAdmin },
          correlationId: period.subscriptionId,
        });
      }

      return told.length;
    });
  }
}
