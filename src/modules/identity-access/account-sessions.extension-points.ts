import type { DbTx } from '../../infrastructure/database/transaction-runner';
import type { SessionRevokedReason } from './public/identity-access.types';

/**
 * Ports that several capabilities of identity-access share (GATE.2). A registered intra-module contract of
 * architecture-structure.spec.ts, not part of the module's public surface: other modules never import it.
 */

/**
 * How an account's sessions end: accounts locks an account, recovery resets the holder's credential. Sessions belong to
 * auth, which implements this (SessionDirectoryService); the consumers name only what they need, so neither imports
 * auth (F-25).
 */
export interface AccountSessions {
  /** Revokes every open session of the account in the caller's transaction. Returns how many were open. */
  revokeAllSessions(tx: DbTx, appUserId: string, reason: SessionRevokedReason, now: Date): Promise<number>;
}

export const ACCOUNT_SESSIONS = Symbol('ACCOUNT_SESSIONS');
