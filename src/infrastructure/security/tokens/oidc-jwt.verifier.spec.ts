import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { OidcJwtVerifier } from './oidc-jwt.verifier';
import { InvalidAccessTokenError, TokenVerificationUnavailableError } from './access-token-verifier.port';

const CONFIGURATION = {
  issuer: 'https://identity.example.com/realms/internal',
  audience: 'software-license-api',
  jwksUri: 'https://identity.example.com/unused-in-this-test',
};

/**
 * A structurally valid compact JWS. jose parses the token before it calls the key
 * resolver, so a malformed string fails with ERR_JWS_INVALID and an injected resolver
 * error would never be reached. Verified against jose 5.10.
 */
const WELL_FORMED_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2V5In0.eyJpc3MiOiJodHRwczovL2kiLCJzdWIiOiJzIn0.c2ln';

function joseFailure(code: string): Error {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

function verifierRejectingWith(error: Error): OidcJwtVerifier {
  return new OidcJwtVerifier(CONFIGURATION, () => {
    throw error;
  });
}

describe('OidcJwtVerifier', () => {
  it('verifies a trusted access token and returns the external identity', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    const verifier = new OidcJwtVerifier(
      {
        issuer: 'https://identity.example.com/realms/internal',
        audience: 'software-license-api',
        jwksUri: 'https://identity.example.com/unused-in-this-test',
      },
      createLocalJWKSet({ keys: [publicJwk] }),
    );
    const token = await new SignJWT({ email: 'user@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
      .setIssuer('https://identity.example.com/realms/internal')
      .setAudience('software-license-api')
      .setSubject('oidc-subject-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifier.verify(token)).resolves.toEqual({
      issuer: 'https://identity.example.com/realms/internal',
      subject: 'oidc-subject-1',
      email: 'user@example.com',
    });
  });

  it('rejects a token issued for another audience', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    const verifier = new OidcJwtVerifier(
      {
        issuer: 'https://identity.example.com/realms/internal',
        audience: 'software-license-api',
        jwksUri: 'https://identity.example.com/unused-in-this-test',
      },
      createLocalJWKSet({ keys: [publicJwk] }),
    );
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://identity.example.com/realms/internal')
      .setAudience('another-api')
      .setSubject('oidc-subject-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it('classifies a malformed token as invalid without reaching the key resolver', async () => {
    let resolverCalled = false;
    const verifier = new OidcJwtVerifier(CONFIGURATION, () => {
      resolverCalled = true;
      throw joseFailure('ERR_JWKS_TIMEOUT');
    });

    await expect(verifier.verify('malformed-token')).rejects.toBeInstanceOf(InvalidAccessTokenError);
    expect(resolverCalled).toBe(false);
  });

  it.each([
    ['ERR_JWS_INVALID'],
    ['ERR_JWS_SIGNATURE_VERIFICATION_FAILED'],
    ['ERR_JWT_INVALID'],
    ['ERR_JWT_EXPIRED'],
    ['ERR_JWT_CLAIM_VALIDATION_FAILED'],
    ['ERR_JOSE_ALG_NOT_ALLOWED'],
    ['ERR_JWKS_NO_MATCHING_KEY'],
    ['ERR_JWKS_MULTIPLE_MATCHING_KEYS'],
  ])('classifies %s as an invalid token', async (code) => {
    const verifier = verifierRejectingWith(joseFailure(code));

    await expect(verifier.verify(WELL_FORMED_TOKEN)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it.each([['ERR_JWKS_TIMEOUT'], ['ERR_JWKS_INVALID'], ['ERR_JOSE_GENERIC']])(
    'classifies %s as verification being unavailable',
    async (code) => {
      const verifier = verifierRejectingWith(joseFailure(code));

      await expect(verifier.verify(WELL_FORMED_TOKEN)).rejects.toBeInstanceOf(TokenVerificationUnavailableError);
    },
  );

  it('classifies a refused connection as verification being unavailable', async () => {
    // jose does not wrap socket failures: an unreachable JWKS host surfaces as a plain
    // Error carrying a Node syscall code, with no JOSE code at all. Verified against jose 5.10.
    const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:8443'), { code: 'ECONNREFUSED' });

    await expect(verifierRejectingWith(refused).verify(WELL_FORMED_TOKEN)).rejects.toBeInstanceOf(
      TokenVerificationUnavailableError,
    );
  });

  it('keeps the underlying failure for operators without putting it in the message', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:8443'), { code: 'ECONNREFUSED' });

    await expect(verifierRejectingWith(refused).verify(WELL_FORMED_TOKEN)).rejects.toMatchObject({
      reason: refused,
      message: 'The access token could not be verified because the identity provider is unreachable.',
    });
  });

  it('rejects a token that verifies but carries no subject', async () => {
    // A token with no `sub` passes signature and claim validation — verified against
    // jose 5.10 — so the identity check must sit OUTSIDE the try block that classifies
    // verification failures. Inside it, this case would be misreported as an outage.
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    const verifier = new OidcJwtVerifier(CONFIGURATION, createLocalJWKSet({ keys: [publicJwk] }));
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(CONFIGURATION.issuer)
      .setAudience(CONFIGURATION.audience)
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});
