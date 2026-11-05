import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationCode, InAppParamValue } from '../../notifications/public/notifications.types';

/** What a case needs to be named in the alert of a wait: the case, its subscription and its organization. */
export interface WaitingRenewal {
  id: string;
  organizationId: string;
  subscriptionId: string;
}

/**
 * The notices of a renewal in the inbox (`FR-3.11`, `US-12-15`), written in the transaction of what they tell: one per person and
 * event key, so a pass that runs again or a retry tells nobody twice (`US-11-01` AC-13). Ids and codes only, never a figure.
 */
@Injectable()
export class RenewalNotifier {
  constructor(private readonly notifications: NotificationsApi) {}

  /**
   * A case waits for a head of the department that owns the subscription, and it has none today: the Super Admin is told with the
   * alert of the steps that wait under control (line 27), once for the proposal. `source` is what began the wait (`sent:<ms>`), so a
   * proposal that is told twice writes one notice. The notice names the case and the subscription, never an amount.
   */
  async waitingForHead(
    tx: DbTx,
    renewal: WaitingRenewal,
    superAdminEmployeeId: string | null,
    source: string,
  ): Promise<void> {
    await this.tell(tx, {
      organizationId: renewal.organizationId,
      recipients: superAdminEmployeeId === null ? [] : [superAdminEmployeeId],
      code: 'CONTROLLED_WAIT_ALERT',
      subject: { type: 'SUBSCRIPTION_RENEWAL', id: renewal.id },
      params: {
        renewalId: renewal.id,
        subscriptionId: renewal.subscriptionId,
        waitingReason: 'NO_HEAD',
        configurationHint: 'ASSIGN_DEPARTMENT_HEAD',
      },
      eventKey: `CONTROLLED_WAIT_ALERT:SUBSCRIPTION_RENEWAL:${renewal.id}:${source}`,
    });
  }

  /** Tells each person once; returns those told now (a person told before for the same key is not among them). */
  async tell(
    tx: DbTx,
    input: {
      organizationId: string;
      recipients: readonly string[];
      code: InAppNotificationCode;
      subject: { type: string; id: string };
      params: Record<string, InAppParamValue>;
      eventKey: string;
    },
  ): Promise<string[]> {
    const told: string[] = [];
    for (const recipientEmployeeId of new Set(input.recipients)) {
      const written = await this.notifications.notifyInApp(tx, {
        organizationId: input.organizationId,
        recipientEmployeeId,
        code: input.code,
        subject: input.subject,
        params: input.params,
        eventKey: input.eventKey,
      });
      if (written) told.push(recipientEmployeeId);
    }

    return told;
  }
}
