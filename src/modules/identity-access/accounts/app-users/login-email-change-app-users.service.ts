import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../../notifications/public/notifications.api';

/**
 * The security notice that goes out when the login email of an account moves: to the address it used and to the one it uses now, queued
 * in the transaction of the change (the worker sends it after the commit). A locked account is told too. The notice holds the two
 * addresses and the time, no link and no token. It lives apart from `AccountLoginEmailFollowService` because that one is loaded in every
 * graph, the command-line ones included, which never load notifications.
 */
@Injectable()
export class LoginEmailChangeNotice {
  constructor(private readonly notifications: NotificationsApi) {}

  async send(tx: DbTx, organizationId: string, moved: { previousEmail: string; currentEmail: string }): Promise<void> {
    const at = new Date().toISOString();
    for (const [recipient, audience] of [
      [moved.previousEmail, 'PREVIOUS'],
      [moved.currentEmail, 'CURRENT'],
    ] as const) {
      await this.notifications.enqueueEmail(tx, {
        organizationId,
        recipient,
        template: 'LOGIN_EMAIL_CHANGED_NOTICE',
        locale: 'vi',
        actionTokenHash: null,
        payload: { audience, ...moved, at },
      });
    }
  }
}
