import type { RecoveryModeName } from './recovery.repo';

export type RecoveryEnvironment = 'LOCAL_TEST' | 'SHARED';

/** What every recovery names, whatever it does (US-01-09 AC-9, AC-13). */
export interface RecoveryContext {
  /** The approved ticket (`R1`). */
  ticketRef: string;
  /** Who approved it, and who runs it: two different people in a shared environment. */
  approverRef: string;
  operatorRef: string;
  /** The reference of the identity check the approver did; recorded, never a secret. */
  identityCheckRef?: string;
  environment: RecoveryEnvironment;
}

export type RecoveryOutcome =
  | 'LINK_SENT'
  | 'LINK_ALREADY_SENT'
  | 'ALREADY_COMPLETED'
  | 'UNLOCKED'
  | 'NOTHING_TO_UNLOCK'
  | 'ACCOUNT_CREATED'
  | 'INVITATION_REISSUED'
  | 'INVITATION_ALREADY_SENT'
  | 'ROLE_TRANSFERRED';

export interface RecoveryResult {
  ticketRef: string;
  mode: RecoveryModeName;
  outcome: RecoveryOutcome;
  /** For a link: where it went. Never the link. */
  sentTo?: 'LOGIN_EMAIL' | 'NEW_EMAIL' | 'WORK_EMAIL';
}
