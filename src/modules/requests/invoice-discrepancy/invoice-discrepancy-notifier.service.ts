import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';

/**
 * Notifies the responsible IT Admin (or usable Super Admin fallback, excluding the acting user) when Finance closes a
 * discrepancy case as an exchange-rate/card-fee difference requiring a subscription monthly price update.
 */
@Injectable()
export class InvoiceDiscrepancyNotifierService {
  constructor(
    private readonly periods: SubscriptionPeriodApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
  ) {}

  async notifyPriceReview(
    tx: DbTx,
    input: {
      organizationId: string;
      subscriptionId: string;
      purchaseInvoiceId: string;
      actorEmployeeId: string;
    },
  ): Promise<void> {
    const [period] = await this.periods.getPurchaseFacts([input.subscriptionId], tx);
    if (!period) return;

    const responsible = period.responsibleItAdminEmployeeId;
    const responsibleUsable =
      responsible !== null && (await this.identity.findUsableItAdminEmployeeIds([responsible], tx)).has(responsible);

    const recipient = await this.resolveRecipient(tx, {
      responsible,
      responsibleUsable,
      actorEmployeeId: input.actorEmployeeId,
    });
    if (recipient === null) return;

    await this.notifications.notifyInApp(tx, {
      organizationId: input.organizationId,
      recipientEmployeeId: recipient,
      code: 'SUBSCRIPTION_PRICE_REVIEW',
      subject: { type: 'SUBSCRIPTION', id: input.subscriptionId },
      params: { subscriptionId: input.subscriptionId, purchaseInvoiceId: input.purchaseInvoiceId },
      eventKey: `SUBSCRIPTION_PRICE_REVIEW:${input.purchaseInvoiceId}`,
    });
  }

  private async resolveRecipient(
    tx: DbTx,
    input: { responsible: string | null; responsibleUsable: boolean; actorEmployeeId: string },
  ): Promise<string | null> {
    if (input.responsible !== null && input.responsibleUsable) {
      return input.responsible === input.actorEmployeeId ? null : input.responsible;
    }
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);

    return superAdmin !== null && superAdmin !== input.actorEmployeeId ? superAdmin : null;
  }
}
