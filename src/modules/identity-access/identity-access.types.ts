export type AppRole = 'SUPER_ADMIN' | 'IT_ADMIN' | 'FINANCE' | 'EMPLOYEE';
export type AppUserStatus = 'ACTIVE' | 'LOCKED';
export type ActivationState = 'INVITED' | 'ACTIVATED';
export type SessionRevokedReason =
  'LOGOUT' | 'REPLAY_DETECTED' | 'ACCOUNT_LOCKED' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET';

export interface AccountSnapshot {
  id: string;
  organizationId: string;
  employeeId: string;
  loginEmail: string;
  status: AppUserStatus;
  activationState: ActivationState;
  /** Null until the account is activated. */
  credentialHash: string | null;
}

export interface SessionSnapshot {
  id: string;
  appUserId: string;
  revokedAt: Date | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface RefreshTokenSnapshot {
  tokenHash: string;
  sessionId: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface ThrottleSnapshot {
  failureCount: number;
  blockedUntil: Date | null;
}

/** Everything the per-request guard needs, from one query. */
export interface PrincipalContext {
  sessionId: string;
  sessionRevokedAt: Date | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  appUserId: string;
  employeeId: string;
  status: AppUserStatus;
  activationState: ActivationState;
  directRoles: AppRole[];
}

export interface CreateAppUserInput {
  organizationId: string;
  employeeId: string;
  loginEmail: string;
  normalizedLoginEmail: string;
  status: AppUserStatus;
  activationState: ActivationState;
  emailVerificationSource: 'BOOTSTRAP_ASSERTED' | 'INVITATION_REDEEMED' | 'RECOVERY_VERIFIED' | null;
  emailVerifiedAt: Date | null;
}

export interface BootstrapSuperAdminInput {
  organizationId: string;
  employeeId: string;
  loginEmail: string;
  passwordHash: string;
  hashPolicyVersion: number;
}

// --- account management (slice 1b) --------------------------------------------------

export type ActionTokenRevokedReason = 'SUPERSEDED' | 'ACCOUNT_LOCKED' | 'CREDENTIAL_CHANGED';
export type ActionTokenPurpose = 'INVITE' | 'RESET_PASSWORD';

export interface ActionTokenSnapshot {
  tokenHash: string;
  appUserId: string;
  purpose: ActionTokenPurpose;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  /** Set on a link the recovery procedure sent (US-01-09), with the address the account takes when it is opened. */
  recoveryTicketId: string | null;
  newLoginEmail: string | null;
  newNormalizedLoginEmail: string | null;
}

export interface RoleGrantRecord {
  role: AppRole;
  grantedAt: Date;
  revokedAt: Date | null;
}

export interface AccountRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  loginEmail: string;
  status: AppUserStatus;
  activationState: ActivationState;
  createdAt: Date;
}

export interface AccountListFilter {
  status?: AppUserStatus;
  activationState?: ActivationState;
  role?: AppRole;
  skip: number;
  take: number;
}

export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  /** The expiry stored for `refreshToken` itself: never the access-token expiry, and not always later than it. */
  refreshTokenExpiresAt: Date;
}

/**
 * What the organization side needs to know about the account of one employee before it relies on them (naming an
 * IT Admin in charge, a department head, an approval role holder). It never carries a credential or an email.
 */
export interface EmployeeAccountInspection {
  hasAccount: boolean;
  /** Active, activated: the account can sign in (the employee having left is the organization's to say). */
  usable: boolean;
  /** The roles granted directly and still in force. */
  roles: AppRole[];
}
