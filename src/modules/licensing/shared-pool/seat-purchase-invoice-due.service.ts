import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import {
  SeatLedgerApi,
  isSeatPurchaseInvoiceOverdue,
  overduePurchaseInvoiceRecipients,
  type SeatPurchaseRecord,
} from '../../catalog/public/seat-ledger.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';

/**
 * Reminds the recorder and R1 responsible party once (`SEAT_PURCHASE_INVOICE_OVERDUE:<purchaseId>`) when a seat
 * purchase invoice is past due (`invoiceDueOn < today`) and still has no open non-returned purchase invoice.
 */
@Injectable()
export class SeatPurchaseInvoiceDueService {
  private readonly logger = new Logger(SeatPurchaseInvoiceDueService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly seatLedger: SeatLedgerApi,
    private readonly periods: SubscriptionPeriodApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
  ) {}

  async remindOverdue(organizationId: string, today: BusinessDate): Promise<{ told: number; failed: number }> {
    const awaiting = await this.seatLedger.listAwaitingInvoicePurchases(organizationId);
    const overdue = awaiting.filter((purchase) => isSeatPurchaseInvoiceOverdue(purchase.invoiceDueOn, today));
    if (overdue.length === 0) return { told: 0, failed: 0 };

    const linePeriodIds = await this.seatLedger.findLinePeriodIds([
      ...new Set(overdue.map((p) => p.subscriptionLineId)),
    ]);
    const subscriptionIds = [...new Set([...linePeriodIds.values()])];
    const periodRows = await this.periods.getPeriods(subscriptionIds);
    const periodBySub = new Map(periodRows.map((p) => [p.subscriptionId, p]));

    const candidateEmployees = [
      ...new Set([
        ...overdue.map((p) => p.recordedByEmployeeId),
        ...periodRows.map((p) => p.responsibleItAdminEmployeeId).filter((id): id is string => id !== null),
      ]),
    ];
    const usableItAdmins = await this.identity.findUsableItAdminEmployeeIds(candidateEmployees);
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId();

    let told = 0;
    let failed = 0;
    for (const purchase of overdue) {
      const subscriptionId = linePeriodIds.get(purchase.subscriptionLineId);
      if (!subscriptionId) continue;
      const responsible = periodBySub.get(subscriptionId)?.responsibleItAdminEmployeeId ?? null;
      const recipients = overduePurchaseInvoiceRecipients({
        recorder: purchase.recordedByEmployeeId,
        recorderUsable: usableItAdmins.has(purchase.recordedByEmployeeId),
        responsible,
        responsibleUsable: responsible !== null && usableItAdmins.has(responsible),
        superAdmin,
      });
      const result = await this.notifyPurchase(organizationId, purchase, subscriptionId, recipients);
      told += result.told;
      failed += result.failed;
    }

    return { told, failed };
  }

  private async notifyPurchase(
    organizationId: string,
    purchase: SeatPurchaseRecord,
    subscriptionId: string,
    recipients: readonly string[],
  ): Promise<{ told: number; failed: number }> {
    let told = 0;
    let failed = 0;
    for (const recipientEmployeeId of recipients) {
      try {
        const sent = await this.runner.run((tx) =>
          this.notifications.notifyInApp(tx, {
            organizationId,
            recipientEmployeeId,
            code: 'SEAT_PURCHASE_INVOICE_OVERDUE',
            subject: { type: 'SEAT_PURCHASE', id: purchase.id },
            params: {
              seatPurchaseId: purchase.id,
              subscriptionId,
              dueOn: purchase.invoiceDueOn!,
            },
            eventKey: `SEAT_PURCHASE_INVOICE_OVERDUE:${purchase.id}`,
          }),
        );
        if (sent) told += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Seat purchase overdue notification failed for ${purchase.id}: ${describeForOperator(error)}`,
        );
      }
    }

    return { told, failed };
  }
}
