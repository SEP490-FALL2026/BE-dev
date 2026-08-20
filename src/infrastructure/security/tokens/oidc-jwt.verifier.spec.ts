import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { OidcJwtVerifier } from './oidc-jwt.verifier';

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

    await expect(verifier.verify(token)).rejects.toThrow();
  });
});
