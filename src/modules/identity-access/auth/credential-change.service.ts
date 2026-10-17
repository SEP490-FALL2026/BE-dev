import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../../../core/email';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import type { AuditEventInput } from '../../audit/audit.types';
import { NotificationsService } from '../../notifications/notifications.service';
import { AccountRepo } from '../accounts/account.repo';
import { AccountSnapshot } from '../identity-access.types';
import { PASSWORD_HASH_POLICY_VERSION } from './password-hasher.service';
import { SessionRepo } from './session.repo';
import { TokenService } from './token.service';

export type CredentialChangeEvent = 'PASSWORD_RESET' | 'PASSWORD_CHANGED';

export interface CredentialChange {
  account: AccountSnapshot;
  /** The new password, already hashed (hashing happens before the transaction: lock protocol rule 3). */
  hash: string;
  event: CredentialChangeEvent;
  /** The account owner's name, for the notice. */
  fullName: string;
  actor: Pick<AuditEventInput, 'actorKind' | 'actorAppUserId' | 'actorRoles' | 'correlationId'>;
  now: Date;
}

/**
 * Everything that must happen together when an account's password is replaced, whether by reset or by
 * change (T-3, T-5, AC-12): the new hash, the end of every session and every other emailed link, a clean
 * slate for sign-in throttling, the notice mail and the audit event. It runs inside the caller's
 * transaction, after the caller has taken the AppUser row lock and re-read the account.
 */
@Injectable()
export class CredentialChangeService {
  constructor(
    private readonly accounts: AccountRepo,
    private readonly sessions: SessionRepo,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  async replace(tx: DbTx, change: CredentialChange): Promise<void> {
    const { account, event, now } = change;

    await this.accounts.replaceCredential(tx, account.id, change.hash, PASSWORD_HASH_POLICY_VERSION, now);
    // Every link still usable dies with the old password; a mail not yet sent is cancelled, not delivered (T-5).
    const usable = (await this.accounts.findUsableTokens(tx, account.id)).map((token) => token.tokenHash);
    await this.accounts.revokeTokens(tx, usable, 'CREDENTIAL_CHANGED', now);
    await this.notifications.cancelPendingForTokens(tx, usable);
    await this.sessions.revokeAllSessions(tx, account.id, event, now);
    // Getting the password back is getting the account back at once (T-3).
    await this.sessions.clearThrottle(
      tx,
      account.organizationId,
      this.tokens.throttleKey(normalizeEmail(account.loginEmail)),
    );
    await this.notifications.enqueueEmail(tx, {
      organizationId: account.organizationId,
      recipient: account.loginEmail,
      template: 'PASSWORD_CHANGED_NOTICE',
      locale: 'vi',
      actionTokenHash: null,
      payload: { event, at: now.toISOString(), fullName: change.fullName },
    });
    // Only the event and its time: no key may look like a secret, and none carries one (AC-9).
    await this.audit.record(tx, {
      organizationId: account.organizationId,
      ...change.actor,
      action: `APP_USER.${event}`,
      resourceType: 'AppUser',
      resourceId: account.id,
      before: null,
      after: { event, at: now.toISOString() },
    });
  }
}
