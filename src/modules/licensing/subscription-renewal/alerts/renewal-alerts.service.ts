import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { InAppNotificationCode, InAppParamValue } from '../../../notifications/public/notifications.types';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';
import type { RenewalPeople } from '../subscription-renewal-parties.service';
import { noticeRecipients, type DataQualityProblem, type DueNoticeKind } from './renewal-adjustment-alerts.policy';
import { WorkspaceAdminAlertService } from './workspace-admin-alert.service';

/** The notices of the point of adjustment: the ones that are not an event of the renewal day. */
export type AlertKind = Extract<DueNoticeKind, 'ADJUSTMENT_POINT' | 'RED_ALERT' | 'KEPT'>;

/** What one pass knows of a period when it looks at its alerts. */
export interface AlertSubject {
  organizationId: string;
  period: RenewalPeriodFacts;
  adjustment: PeriodAdjustment;
  seatsNeeded: number;
  people: RenewalPeople;
  kinds: readonly AlertKind[];
}

const CODE_OF: Record<AlertKind, InAppNotificationCode> = {
  ADJUSTMENT_POINT: 'SUBSCRIPTION_RENEWAL_ALERT',
  RED_ALERT: 'SUBSCRIPTION_RENEWAL_RED_ALERT',
  KEPT: 'SUBSCRIPTION_RENEWAL_KEPT',
};

/**
 * The alerts of the point of adjustment of a period (`SBF-20` §4.5, `US-11-01`): the IT Admin in charge is told the point came and what the
 * next period needs, Finance too when a plan by the year is at its red alert, the IT Admin when a plan by the month keeps its seats; a period
 * with no date, or a plan by the year with no deadline to cancel, gives the IT Admin a warning of the quality of its contract data instead of
 * a guessed date. Each person is told once for a period and each notice has its audit event. Nothing is renewed, cancelled or recorded here.
 */
@Injectable()
export class RenewalAlertsService {
  constructor(
    private readonly notifier: RenewalNotifier,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly workspaceAdmins: WorkspaceAdminAlertService,
  ) {}

  /** Emits `WORKSPACE_ADMIN_NOT_WORKING` once per `(workspace, admin)` during the hourly renewal sweep (W3-12). */
  sweepWorkspaceAdmins(organizationId: string): Promise<number> {
    return this.workspaceAdmins.sweep(organizationId);
  }

  /** Writes what is due for the period; returns how many people were told now. */
  async sendDue(subject: AlertSubject): Promise<number> {
    if (subject.kinds.length === 0) return 0;

    return this.runner.run(async (tx) => {
      let told = 0;
      for (const kind of subject.kinds) {
        const { period, adjustment } = subject;
        const sent = await this.notifier.tell(tx, {
          organizationId: subject.organizationId,
          recipients: noticeRecipients(kind, subject.people),
          code: CODE_OF[kind],
          subject: { type: 'SUBSCRIPTION', id: period.subscriptionId },
          params: this.paramsOf(kind, subject),
          eventKey: this.eventKeyOf(kind, period.subscriptionId, adjustment.deadline),
        });
        for (const employeeId of sent) {
          await this.audit.record(tx, {
            organizationId: subject.organizationId,
            actorKind: 'SYSTEM',
            action: 'SUBSCRIPTION_RENEWAL.ALERT_SENT',
            resourceType: 'Subscription',
            resourceId: period.subscriptionId,
            before: null,
            after: {
              kind,
              baseDate: adjustment.deadline,
              renewalOn: adjustment.end,
              commitment: adjustment.commitment,
              recipientEmployeeId: employeeId,
            },
            correlationId: period.subscriptionId,
          });
        }
        told += sent.length;
      }

      return told;
    });
  }

  private paramsOf(kind: AlertKind, subject: AlertSubject): Record<string, InAppParamValue> {
    const { period, adjustment, seatsNeeded } = subject;
    const base = { subscriptionId: period.subscriptionId, renewalOn: adjustment.end, seatsNeeded };
    if (kind === 'ADJUSTMENT_POINT') {
      return { ...base, renewalId: null, baseDate: adjustment.deadline, commitment: adjustment.commitment };
    }
    if (kind === 'RED_ALERT') return { ...base, baseDate: adjustment.deadline };

    return { ...base, purchasedQuantity: period.purchasedQuantity };
  }

  private eventKeyOf(kind: AlertKind, subscriptionId: string, deadline: BusinessDate): string {
    const prefix =
      kind === 'ADJUSTMENT_POINT'
        ? 'subscription-adjustment-point'
        : kind === 'RED_ALERT'
          ? 'subscription-renewal-red'
          : 'subscription-renewal-kept';

    return `${prefix}:${subscriptionId}:${deadline}`;
  }

  /** A problem of the data of the period: the IT Admin is warned once for each (period, problem); no date is guessed. */
  async dataQualityWarning(subject: {
    organizationId: string;
    period: RenewalPeriodFacts;
    itAdmin: string | null;
    problem: DataQualityProblem;
  }): Promise<number> {
    const { period, itAdmin, problem } = subject;
    if (itAdmin === null) return 0;
    // The first problem keeps the key it always had, so a warning already told is not told again.
    const eventKey =
      problem === 'NO_ALERT_ANCHOR'
        ? `subscription-renewal-data-quality:${period.subscriptionId}`
        : `subscription-renewal-data-quality:${period.subscriptionId}:${problem}`;

    return this.runner.run(async (tx) => {
      const told = await this.notifier.tell(tx, {
        organizationId: subject.organizationId,
        recipients: [itAdmin],
        code: 'SUBSCRIPTION_RENEWAL_DATA_QUALITY',
        subject: { type: 'SUBSCRIPTION', id: period.subscriptionId },
        params: { subscriptionId: period.subscriptionId, problem },
        eventKey,
      });
      if (told.length > 0) {
        await this.audit.record(tx, {
          organizationId: subject.organizationId,
          actorKind: 'SYSTEM',
          action: 'SUBSCRIPTION_RENEWAL.DATA_QUALITY_WARNED',
          resourceType: 'Subscription',
          resourceId: period.subscriptionId,
          before: null,
          after: { problem, recipientEmployeeId: itAdmin },
          correlationId: period.subscriptionId,
        });
      }

      return told.length;
    });
  }
}
