import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import { AccessTokenVerifierPort, ExternalIdentity } from './access-token-verifier.port';

export interface OidcJwtVerifierConfiguration {
  issuer: string;
  audience: string;
  jwksUri: string;
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
    const { payload } = await jwtVerify(token, this.keyResolver, {
      algorithms: ['RS256'],
      issuer: this.configuration.issuer,
      audience: this.configuration.audience,
    });

    if (!payload.iss || !payload.sub) {
      throw new Error('Access token is missing a stable external identity');
    }

    return {
      issuer: payload.iss,
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
    };
  }
}
