import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AccountSessions } from '../accounts/account-sessions.types';
import { PrincipalContext, SessionRevokedReason } from '../public/identity-access.types';
import { SessionRepo } from './session.repo';

/**
 * What other capabilities need from the sessions auth owns: the per-request principal context of the guard, and the
 * end of every session of an account (locking it; recovering its credential). The sessions stay private to auth.
 */
@Injectable()
export class SessionDirectoryService implements AccountSessions {
  constructor(private readonly sessions: SessionRepo) {}

  /** One query for the per-request guard: session, account and effective direct grants. */
  findPrincipalContext(sessionId: string): Promise<PrincipalContext | null> {
    return this.sessions.findPrincipalContext(sessionId);
  }

  /** Revokes every open session of the account in the caller's transaction. Returns how many were open. */
  revokeAllSessions(tx: DbTx, appUserId: string, reason: SessionRevokedReason, now: Date): Promise<number> {
    return this.sessions.revokeAllSessions(tx, appUserId, reason, now);
  }
}
