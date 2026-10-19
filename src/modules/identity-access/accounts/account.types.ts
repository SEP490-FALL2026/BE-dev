import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SessionRevokedReason } from '../identity-access.types';

/**
 * How accounts end every session of an account (locking it; the recovery of its credential). Sessions belong to auth,
 * which implements this; accounts only names what it needs, so it never imports auth (F-25).
 */
export interface AccountSessions {
  /** Revokes every open session of the account in the caller's transaction. Returns how many were open. */
  revokeAllSessions(tx: DbTx, appUserId: string, reason: SessionRevokedReason, now: Date): Promise<number>;
}

export const ACCOUNT_SESSIONS = Symbol('ACCOUNT_SESSIONS');

/**
 * The approval roles an employee holds now, which the successor check of the Super Admin role refuses (US-01-09 AC-3).
 * Approval roles implement this; accounts only names what it needs, so it never imports them.
 */
export interface ApprovalRoleHoldings {
  rolesHeldBy(client: DbTx | undefined, employeeId: string): Promise<string[]>;
}

export const APPROVAL_ROLE_HOLDINGS = Symbol('APPROVAL_ROLE_HOLDINGS');
