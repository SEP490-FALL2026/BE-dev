export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

/**
 * Who is calling, resolved on every request. Roles are never read from the token: they come
 * from the database each time, so a revoked role or locked account bites on the next request.
 * Role names are plain strings here so infrastructure does not depend on a business module.
 */
export interface AuthenticatedPrincipal {
  /** The account id; the stable identity of the caller. */
  subject: string;
  appUserId: string;
  sessionId: string;
  employeeId: string;
  /** Roles granted directly and still in force: the array `/me` returns (US-01-01 AC-17). No role is derived from data (QĐ-93a). */
  directRoles: readonly string[];
  /** What authorization checks: `directRoles`, but without MANAGER when the person heads no department today (US-01-02 AC-3). */
  roles: readonly string[];
}

export interface AccessTokenVerifierPort {
  verify(token: string): Promise<AuthenticatedPrincipal>;
}

/** The caller's token is genuinely bad: malformed, expired, wrong signature, wrong audience. */
export class InvalidAccessTokenError extends Error {
  constructor(message = 'The access token is invalid.') {
    super(message);
    this.name = 'InvalidAccessTokenError';
  }
}

/**
 * Verification could not be completed because an authentication dependency is unavailable.
 * The token may well be valid. `reason` is for operators only and must never reach a caller.
 */
export class TokenVerificationUnavailableError extends Error {
  constructor(readonly reason: unknown) {
    super('The access token could not be verified because authentication is unavailable.');
    this.name = 'TokenVerificationUnavailableError';
  }
}
