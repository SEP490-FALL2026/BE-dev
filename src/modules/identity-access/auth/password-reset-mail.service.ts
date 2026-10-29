import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { EmployeeRecord } from '../../organization/public/organization.types';
import { ActionLinkRevocation } from '../accounts/action-link-revocation.service';
import { ActionLinkService } from '../accounts/action-link.service';
import { AccountSnapshot } from '../public/identity-access.types';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * The link a forgotten-password request mails (T-1, T-2, T-4): at most a configured number an hour, one working at a
 * time, always to the email stored on the account. Runs in the caller's transaction, under its AppUser lock.
 */
@Injectable()
export class PasswordResetMailService {
  constructor(
    private readonly links: ActionLinkService,
    private readonly revocation: ActionLinkRevocation,
    private readonly notifications: NotificationsApi,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Issues and mails a new reset link; false, with nothing done, when the hourly limit is reached. */
  async send(tx: DbTx, account: AccountSnapshot, employee: EmployeeRecord, now: Date): Promise<boolean> {
    const issuedLastHour = await this.links.countTokensSince(
      tx,
      account.id,
      'RESET_PASSWORD',
      new Date(now.getTime() - ONE_HOUR_MS),
    );
    if (issuedLastHour >= this.config.get('AUTH_PASSWORD_RESET_MAX_PER_HOUR', { infer: true })) return false;

    // At most one link works at a time: the older one is revoked and its mail, if not yet sent, cancelled (T-4).
    await this.revocation.revokeUsable(tx, account.id, 'SUPERSEDED', now, 'RESET_PASSWORD');

    const issued = await this.links.issue(
      tx,
      { appUserId: account.id, purpose: 'RESET_PASSWORD', createdBy: null },
      'PASSWORD_RESET',
      now,
    );
    // To the email stored on the account, never to the one the caller typed.
    await this.notifications.enqueueEmail(tx, {
      organizationId: account.organizationId,
      recipient: account.loginEmail,
      template: 'PASSWORD_RESET',
      locale: 'vi',
      actionTokenHash: issued.hash,
      payload: { token: issued.token, expiresAt: issued.expiresAt.toISOString(), fullName: employee.fullName },
    });

    return true;
  }
}
