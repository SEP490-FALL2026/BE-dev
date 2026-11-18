import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationCode, InAppParamValue } from '../../notifications/public/notifications.types';

/**
 * The notices of a renewal in the inbox (`FR-3.11`, `US-12-15`), written in the transaction of what they tell: one per person and
 * event key, so a pass that runs again or a retry tells nobody twice (`US-11-01` AC-13). Ids and codes only, never a figure.
 */
@Injectable()
export class RenewalNotifier {
  constructor(private readonly notifications: NotificationsApi) {}

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
