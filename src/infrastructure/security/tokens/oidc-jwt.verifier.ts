import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import {
  AccessTokenVerifierPort,
  ExternalIdentity,
  InvalidAccessTokenError,
  TokenVerificationUnavailableError,
} from './access-token-verifier.port';

export interface OidcJwtVerifierConfiguration {
  issuer: string;
  audience: string;
  jwksUri: string;
}

/**
 * Allow-list of jose error codes that mean "the caller's token is bad".
 *
 * This is an allow-list rather than a deny-list on purpose. jose does not wrap socket
 * failures — an unreachable JWKS host surfaces as a plain Error with a Node syscall code
 * such as ECONNREFUSED — so any deny-list would have to enumerate every possible network
 * failure and would misreport the ones it missed as invalid tokens. Failing the other way
 * costs a caller one retry; failing this way hides an outage behind 401s.
 */
const TOKEN_ERROR_CODES: ReadonlySet<string> = new Set([
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWT_INVALID',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
]);

function classifyVerificationFailure(error: unknown): Error {
  const code: unknown = (error as { code?: unknown }).code;

  return typeof code === 'string' && TOKEN_ERROR_CODES.has(code)
    ? new InvalidAccessTokenError()
    : new TokenVerificationUnavailableError(error);
}

export class OidcJwtVerifier implements AccessTokenVerifierPort {
  private readonly keyResolver: JWTVerifyGetKey;

  constructor(
    private readonly configuration: OidcJwtVerifierConfiguration,
    keyResolver?: JWTVerifyGetKey,
  ) {
    this.keyResolver = keyResolver ?? createRemoteJWKSet(new URL(configuration.jwksUri));
  }

  async verify(token: string): Promise<ExternalIdentity> {
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];

    try {
      ({ payload } = await jwtVerify(token, this.keyResolver, {
        algorithms: ['RS256'],
        issuer: this.configuration.issuer,
        audience: this.configuration.audience,
      }));
    } catch (error) {
      throw classifyVerificationFailure(error);
    }

    if (!payload.iss || !payload.sub) {
      throw new InvalidAccessTokenError('Access token is missing a stable external identity');
    }

    return {
      issuer: payload.iss,
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
    };
  }
}
