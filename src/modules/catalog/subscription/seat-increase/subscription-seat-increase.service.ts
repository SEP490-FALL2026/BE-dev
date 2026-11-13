import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { seatIncreaseNoticeOwed, seatIncreaseRecipients } from './subscription-seat-increase.policy';
import type { ProvisioningType } from '../subscription.types';

/** What a rise of the seats bought of a subscription is told from: the subscription, the two numbers, the request it was bought for (if any) and who bought. */
export interface SeatIncrease {
  organizationId: string;
  subscriptionId: string;
  planProvisioningType: ProvisioningType;
  responsibleItAdminEmployeeId: string | null;
  from: number | null;
  to: number | null;
  requestId: string | null;
  actor: AuthenticatedPrincipal;
}

/**
 * The one place a rise of the seats bought of a subscription is told (`QĐ-110v`, `S-4`, SPEC P24): whoever raises `purchased_quantity` (the seat a grant
 * buys, a change of the quantity) calls it in the same transaction, so the notice exists exactly when the rise commits. Only the pool of a `K2` or `K4`
 * plan is told (`seatIncreaseNoticeOwed`); the notice goes to the IT Admin who answers for the subscription unless they bought, or to every other IT
 * Admin when nobody usable answers for it (`seatIncreaseRecipients`). It is a notice and never a step to approve.
 */
@Injectable()
export class SubscriptionSeatIncreaseService {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** Returns how many IT Admins were told. */
  async told(tx: DbTx, input: SeatIncrease): Promise<number> {
    if (!seatIncreaseNoticeOwed({ planProvisioningType: input.planProvisioningType, from: input.from, to: input.to }))
      return 0;
    const usable = new Set(await this.identity.findAllUsableItAdminEmployeeIds(tx));
    const recipients = seatIncreaseRecipients({
      responsible: input.responsibleItAdminEmployeeId,
      usable,
      actor: input.actor.employeeId,
    });
    // Every rise is its own event: the same two numbers can come round again after the seats were cut back.
    const occurrence = randomUUID();
    let told = 0;
    for (const recipientEmployeeId of recipients) {
      const written = await this.notifications.notifyInApp(tx, {
        organizationId: input.organizationId,
        recipientEmployeeId,
        code: 'SUBSCRIPTION_SEATS_INCREASED',
        subject: { type: 'SUBSCRIPTION', id: input.subscriptionId },
        params: {
          subscriptionId: input.subscriptionId,
          fromQuantity: input.from,
          toQuantity: input.to,
          requestId: input.requestId,
          changedByEmployeeId: input.actor.employeeId,
        },
        eventKey: `SUBSCRIPTION_SEATS_INCREASED:${input.subscriptionId}:${input.to}:${occurrence}`,
      });
      if (written) told += 1;
    }

    return told;
  }
}
