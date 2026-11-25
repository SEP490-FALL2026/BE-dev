import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { seatPurchaseRecipients } from './seat-purchase.policy';
import { SeatPurchaseRepo } from './seat-purchase.repo';
import type { NewSeatPurchase, SeatPurchaseRecord } from './seat-purchase.types';

export interface NotifySeatsBoughtInput {
  organizationId: string;
  subscriptionId: string;
  subscriptionLineId: string;
  seatPurchaseId: string;
  quantity: number;
  responsibleItAdminEmployeeId: string | null;
  actor: AuthenticatedPrincipal;
}

/** Capability-internal entry for `subscription-line/purchase/` used by ledger writes, views, and purchase notifications. */
@Injectable()
export class SeatPurchaseService {
  constructor(
    private readonly repo: SeatPurchaseRepo,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
  ) {}

  insert(tx: DbTx, input: NewSeatPurchase): Promise<SeatPurchaseRecord> {
    return this.repo.insert(tx, input);
  }

  find(id: string, tx?: DbTx): Promise<SeatPurchaseRecord | null> {
    return this.repo.find(id, tx);
  }

  findMany(ids: readonly string[], tx?: DbTx): Promise<SeatPurchaseRecord[]> {
    return this.repo.findMany(ids, tx);
  }

  ofLine(lineId: string, tx?: DbTx): Promise<SeatPurchaseRecord[]> {
    return this.repo.ofLine(lineId, tx);
  }

  awaitingInvoice(organizationId: string, tx?: DbTx): Promise<SeatPurchaseRecord[]> {
    return this.repo.awaitingInvoice(organizationId, tx);
  }

  ofSubscriptionMonthNoInvoice(subscriptionId: string, from: BusinessDate, untilExclusive: BusinessDate, tx?: DbTx) {
    return this.repo.ofSubscriptionMonthNoInvoice(subscriptionId, from, untilExclusive, tx);
  }

  /** Sends `SUBSCRIPTION_SEATS_BOUGHT` per R1 (usable responsible IT Admin != actor, else usable Super Admin != actor). */
  async notifySeatsBought(tx: DbTx, input: NotifySeatsBoughtInput): Promise<number> {
    const responsible = input.responsibleItAdminEmployeeId;
    const responsibleUsable =
      responsible !== null && (await this.identity.findUsableItAdminEmployeeIds([responsible], tx)).has(responsible);
    const superAdmin = responsibleUsable ? null : await this.identity.findUsableSuperAdminEmployeeId(tx);
    const recipients = seatPurchaseRecipients({
      responsible,
      responsibleUsable,
      superAdmin,
      actor: input.actor.employeeId,
    });
    let told = 0;
    for (const recipientEmployeeId of recipients) {
      const sent = await this.notifications.notifyInApp(tx, {
        organizationId: input.organizationId,
        recipientEmployeeId,
        code: 'SUBSCRIPTION_SEATS_BOUGHT',
        subject: { type: 'SUBSCRIPTION', id: input.subscriptionId },
        params: {
          subscriptionId: input.subscriptionId,
          subscriptionLineId: input.subscriptionLineId,
          seatPurchaseId: input.seatPurchaseId,
          quantity: input.quantity,
          recordedByEmployeeId: input.actor.employeeId,
        },
        eventKey: `SUBSCRIPTION_SEATS_BOUGHT:${input.seatPurchaseId}`,
      });
      if (sent) told += 1;
    }

    return told;
  }
}
