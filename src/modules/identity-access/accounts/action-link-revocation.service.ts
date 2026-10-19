import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsService } from '../../notifications/notifications.service';
import { ActionTokenPurpose, ActionTokenRevokedReason } from '../identity-access.types';
import { ActionLinkService } from './action-link.service';

/**
 * Ends the links an account could still use, and cancels their mails not yet sent so a dead link is never delivered
 * (T-4, T-5). One step, because every caller (a new invitation or reset link, a lock, a password change, the recovery
 * of a credential) needs both halves together.
 */
@Injectable()
export class ActionLinkRevocation {
  constructor(
    private readonly links: ActionLinkService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Revokes every usable token of the account (of one purpose, or all) and returns their hashes. */
  async revokeUsable(
    tx: DbTx,
    appUserId: string,
    reason: ActionTokenRevokedReason,
    now: Date,
    purpose?: ActionTokenPurpose,
  ): Promise<string[]> {
    const usable = (await this.links.findUsableTokens(tx, appUserId, purpose)).map((token) => token.tokenHash);
    await this.links.revokeTokens(tx, usable, reason, now);
    await this.notifications.cancelPendingForTokens(tx, usable);

    return usable;
  }
}
