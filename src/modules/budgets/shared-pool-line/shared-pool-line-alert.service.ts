import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SharedPoolLineFactsService } from './shared-pool-line-facts.service';

const MAX_ALERT_SUBSCRIPTIONS = 500;

/**
 * Dispatches monthly `IDLE_SEAT_COST_RATIO_HIGH` notifications (`W3-06`, R1) when a pool subscription's excess idle
 * seat cost exceeds 10% of paid seat cost for an ended month, idempotently once per subscription and month.
 */
@Injectable()
export class SharedPoolLineAlertService {
  constructor(
    private readonly facts: SharedPoolLineFactsService,
    private readonly identity: IdentityAccessApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifications: NotificationsApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Evaluates `month` (`YYYY-MM-01`) and delivers new `IDLE_SEAT_COST_RATIO_HIGH` alerts; returns count written. */
  async warnIdleRatioForMonth(month: BusinessDate): Promise<number> {
    const lines = await this.facts.linesOfMonth(month, undefined, MAX_ALERT_SUBSCRIPTIONS);
    const exceeding = lines.filter((line) => line.exceedsIdleRatioThreshold);
    if (exceeding.length === 0) return 0;

    const org = await this.organizationReads.getOrganization();
    if (!org) return 0;

    const responsibleIds = [
      ...new Set(
        exceeding.flatMap((line) => (line.responsibleItAdminEmployeeId ? [line.responsibleItAdminEmployeeId] : [])),
      ),
    ];
    const usableItAdmins = await this.identity.findUsableItAdminEmployeeIds(responsibleIds);
    let superAdminLoaded = false;
    let superAdminId: string | null = null;
    const resolveRecipient = async (responsibleId: string | null): Promise<string | null> => {
      if (responsibleId !== null && usableItAdmins.has(responsibleId)) return responsibleId;
      if (!superAdminLoaded) {
        superAdminId = await this.identity.findUsableSuperAdminEmployeeId();
        superAdminLoaded = true;
      }

      return superAdminId;
    };

    const yearMonth = month.slice(0, 7);
    const deliveries: { subscriptionId: string; recipientEmployeeId: string; ratioPercent: string }[] = [];
    for (const line of exceeding) {
      const recipientEmployeeId = await resolveRecipient(line.responsibleItAdminEmployeeId);
      if (recipientEmployeeId !== null) {
        deliveries.push({
          subscriptionId: line.subscriptionId,
          recipientEmployeeId,
          ratioPercent: line.ratioPercent,
        });
      }
    }
    if (deliveries.length === 0) return 0;

    return this.runner.run(async (tx) => {
      let sent = 0;
      for (const item of deliveries) {
        const delivered = await this.notifications.notifyInApp(tx, {
          organizationId: org.id,
          recipientEmployeeId: item.recipientEmployeeId,
          code: 'IDLE_SEAT_COST_RATIO_HIGH',
          subject: { type: 'SUBSCRIPTION', id: item.subscriptionId },
          params: {
            subscriptionId: item.subscriptionId,
            month: yearMonth,
            ratioPercent: item.ratioPercent,
          },
          eventKey: `IDLE_SEAT_COST_RATIO_HIGH:${item.subscriptionId}:${yearMonth}`,
        });
        if (delivered) sent += 1;
      }

      return sent;
    });
  }
}
