export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

export interface ExternalIdentity {
  issuer: string;
  subject: string;
  email: string | null;
}

export interface AccessTokenVerifierPort {
  verify(token: string): Promise<ExternalIdentity>;
}

/** The caller's token is genuinely bad: malformed, expired, wrong signature, wrong audience. */
export class InvalidAccessTokenError extends Error {
  constructor(message = 'The access token is invalid.') {
    super(message);
    this.name = 'InvalidAccessTokenError';
  }
}

/**
 * Verification could not be completed because the identity provider could not be reached.
 * The token may well be valid. `reason` is for operators only and must never reach a caller.
 */
export class TokenVerificationUnavailableError extends Error {
  constructor(readonly reason: unknown) {
    super('The access token could not be verified because the identity provider is unreachable.');
    this.name = 'TokenVerificationUnavailableError';
  }
}
