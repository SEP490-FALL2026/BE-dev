import { Injectable, Optional } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { LicenseLotCostService } from './license-lot-cost.service';
import { SharedPoolLineFactsService } from './shared-pool-line-facts.service';

const MAX_ALERT_SUBSCRIPTIONS = 500;

/**
 * Dispatches monthly `IDLE_SEAT_COST_RATIO_HIGH` (subscriptions) and `LICENSE_LOT_IDLE_COST_HIGH` (lots) notifications
 * when excess idle cost exceeds 10% for an ended month, idempotently once per subject and month.
 */
@Injectable()
export class SharedPoolLineAlertService {
  constructor(
    private readonly facts: SharedPoolLineFactsService,
    private readonly identity: IdentityAccessApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifications: NotificationsApi,
    private readonly runner: TransactionRunner,
    @Optional() private readonly lotCosts?: LicenseLotCostService,
  ) {}

  /** Evaluates `month` (`YYYY-MM-01`) and delivers new `IDLE_SEAT_COST_RATIO_HIGH` and `LICENSE_LOT_IDLE_COST_HIGH` alerts; returns count written. */
  async warnIdleRatioForMonth(month: BusinessDate): Promise<number> {
    const org = await this.organizationReads.getOrganization();
    if (!org) return 0;

    const exceeding = (await this.facts.linesOfMonth(month, undefined, MAX_ALERT_SUBSCRIPTIONS)).filter(
      (line) => line.exceedsIdleRatioThreshold,
    );
    const exceedingLots = this.lotCosts ? await this.lotCosts.idleAlertsForMonth(org.id, month) : [];
    if (exceeding.length === 0 && exceedingLots.length === 0) return 0;

    const { subDeliveries, lotDeliveries } = await this.buildDeliveries(exceeding, exceedingLots);
    if (subDeliveries.length === 0 && lotDeliveries.length === 0) return 0;

    return this.runner.run((tx) => this.deliverAllInTx(tx, org.id, month.slice(0, 7), subDeliveries, lotDeliveries));
  }

  private async buildDeliveries(
    exceeding: readonly { subscriptionId: string; responsibleItAdminEmployeeId: string | null; ratioPercent: string }[],
    exceedingLots: readonly { lotId: string; responsibleItAdminEmployeeId: string | null; ratioPercent: string }[],
  ) {
    const responsibleIds = [
      ...new Set(
        [
          ...exceeding.map((l) => l.responsibleItAdminEmployeeId),
          ...exceedingLots.map((l) => l.responsibleItAdminEmployeeId),
        ].filter((id): id is string => id !== null),
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

    const subDeliveries: { subscriptionId: string; recipientEmployeeId: string; ratioPercent: string }[] = [];
    for (const line of exceeding) {
      const recipientEmployeeId = await resolveRecipient(line.responsibleItAdminEmployeeId);
      if (recipientEmployeeId !== null)
        subDeliveries.push({
          subscriptionId: line.subscriptionId,
          recipientEmployeeId,
          ratioPercent: line.ratioPercent,
        });
    }
    const lotDeliveries: { lotId: string; recipientEmployeeId: string; ratioPercent: string }[] = [];
    for (const lot of exceedingLots) {
      const recipientEmployeeId = await resolveRecipient(lot.responsibleItAdminEmployeeId);
      if (recipientEmployeeId !== null)
        lotDeliveries.push({ lotId: lot.lotId, recipientEmployeeId, ratioPercent: lot.ratioPercent });
    }

    return { subDeliveries, lotDeliveries };
  }

  private async deliverAllInTx(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    organizationId: string,
    yearMonth: string,
    subDeliveries: readonly { subscriptionId: string; recipientEmployeeId: string; ratioPercent: string }[],
    lotDeliveries: readonly { lotId: string; recipientEmployeeId: string; ratioPercent: string }[],
  ): Promise<number> {
    let sent = 0;
    for (const item of subDeliveries) {
      const delivered = await this.notifications.notifyInApp(tx, {
        organizationId,
        recipientEmployeeId: item.recipientEmployeeId,
        code: 'IDLE_SEAT_COST_RATIO_HIGH',
        subject: { type: 'SUBSCRIPTION', id: item.subscriptionId },
        params: { subscriptionId: item.subscriptionId, month: yearMonth, ratioPercent: item.ratioPercent },
        eventKey: `IDLE_SEAT_COST_RATIO_HIGH:${item.subscriptionId}:${yearMonth}`,
      });
      if (delivered) sent += 1;
    }
    for (const item of lotDeliveries) {
      const delivered = await this.notifications.notifyInApp(tx, {
        organizationId,
        recipientEmployeeId: item.recipientEmployeeId,
        code: 'LICENSE_LOT_IDLE_COST_HIGH',
        subject: { type: 'LICENSE_LOT', id: item.lotId },
        params: { lotId: item.lotId, month: yearMonth, ratioPercent: item.ratioPercent },
        eventKey: `LICENSE_LOT_IDLE_COST_HIGH:${item.lotId}:${yearMonth}`,
      });
      if (delivered) sent += 1;
    }

    return sent;
  }
}
