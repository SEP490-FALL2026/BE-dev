export type AppRole = 'SUPER_ADMIN' | 'IT_ADMIN' | 'FINANCE' | 'EMPLOYEE';
export type AppUserStatus = 'ACTIVE' | 'LOCKED';
export type ActivationState = 'INVITED' | 'ACTIVATED';
export type SessionRevokedReason = 'LOGOUT' | 'REPLAY_DETECTED' | 'ACCOUNT_LOCKED';

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
  emailVerificationSource: 'BOOTSTRAP_ASSERTED' | 'INVITATION_REDEEMED' | null;
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

export type ActionTokenRevokedReason = 'SUPERSEDED' | 'ACCOUNT_LOCKED';

export interface ActionTokenSnapshot {
  tokenHash: string;
  appUserId: string;
  purpose: 'INVITE';
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
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
  /** Remaining absolute lifetime of the session, for the cookie Max-Age. */
  sessionRemainingMs: number;
}
