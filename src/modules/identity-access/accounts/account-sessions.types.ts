import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SessionRevokedReason } from '../public/identity-access.types';

/**
 * The port through which several capabilities of identity-access end the sessions of an account. It is not part of
 * the module's public surface: other modules never import it, and `test/gates/module-graph.gate-spec.ts` pins the one file
 * that declares it. It lives in `accounts/`, the capability that both consumers already import: `accounts` locks an
 * account, `recovery` resets the holder's credential, and `auth` implements it, so putting it in `auth/` would make
 * `accounts` and `recovery` import `auth`.
 *
 * Sessions belong to auth, which implements this (SessionDirectoryService); the consumers name only what they need, so
 * neither imports auth.
 */
export interface AccountSessions {
  /** Revokes every open session of the account in the caller's transaction. Returns how many were open. */
  revokeAllSessions(tx: DbTx, appUserId: string, reason: SessionRevokedReason, now: Date): Promise<number>;
}

export const ACCOUNT_SESSIONS = Symbol('ACCOUNT_SESSIONS');
