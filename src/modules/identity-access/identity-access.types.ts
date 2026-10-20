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

/** The approval roles a person can hold (US-01-03); who holds them stays inside the module. */
export type ApprovalRoleKind = 'SPENDING_APPROVER' | 'CONFLICT_SUBSTITUTE' | 'FALLBACK_APPROVER';

/** An account status and activation state as one key, for counts. */
export type AccountStateKey = 'ACTIVE_ACTIVATED' | 'ACTIVE_INVITED' | 'LOCKED_ACTIVATED' | 'LOCKED_INVITED';

/**
 * The account side of an installation inspection (`ops:inspect`): counts only, plus the state and login email of the
 * Super Admin account (the command masks the email before it prints it). No id, name, hash or token.
 */
export interface AccountInventory {
  superAdmin: { holders: number; status: AppUserStatus; activationState: ActivationState; loginEmail: string } | null;
  accountsByState: Record<AccountStateKey, number>;
  directRoles: Record<AppRole, number>;
  approvalRoles: Record<ApprovalRoleKind, number>;
}

/** The direct roles a local demo account may hold (`pnpm dev:seed`): never SUPER_ADMIN, never a derived role. */
export type DemoAccountRole = 'IT_ADMIN' | 'FINANCE' | 'EMPLOYEE';

/** Whether a demo account can be created, is already there as the fixture wants it, or conflicts with real data. */
export type DemoAccountState =
  | { state: 'absent' }
  | { state: 'present' }
  | { state: 'conflict'; reason: 'ACCOUNT_DIFFERS' | 'LOGIN_EMAIL_TAKEN' | 'FINANCE_HELD_ELSEWHERE' };

export interface CreateDemoAccountInput {
  organizationId: string;
  employeeId: string;
  loginEmail: string;
  role: DemoAccountRole;
  passwordHash: string;
  hashPolicyVersion: number;
}
