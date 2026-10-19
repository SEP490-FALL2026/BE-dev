import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ACCOUNT_SESSIONS, AccountSessions } from '../identity-access.ports';
import { ActionLinkRevocation } from '../accounts/action-link-revocation.service';
import { CredentialService } from '../accounts/credential.service';

/**
 * What an operator's credential reset takes away from the holder (AC-9): every link, every session and the old password,
 * which a credential nobody knows replaces. The sessions end through the repository that owns them, in the same
 * transaction (F-19, E6).
 */
@Injectable()
export class HolderCredentialReset {
  constructor(
    private readonly credentials: CredentialService,
    private readonly revocation: ActionLinkRevocation,
    @Inject(ACCOUNT_SESSIONS) private readonly sessions: AccountSessions,
  ) {}

  /** Slow, and made before any lock (lock protocol rule 3): a credential nobody knows, which replaces the old one. */
  prepareUnknownCredential(): Promise<string> {
    return this.credentials.hash(randomBytes(32).toString('base64url'));
  }

  /** Every link and session of the account ends, and the old credential stops working. */
  async reset(tx: DbTx, appUserId: string, unknownHash: string, now: Date): Promise<void> {
    await this.revocation.revokeUsable(tx, appUserId, 'SUPERSEDED', now);
    await this.credentials.replaceCredential(tx, appUserId, unknownHash, now);
    await this.sessions.revokeAllSessions(tx, appUserId, 'PASSWORD_RESET', now);
  }
}
