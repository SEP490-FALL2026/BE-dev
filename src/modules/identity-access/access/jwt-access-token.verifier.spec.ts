import { TokenVerificationUnavailableError } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationService } from '../../organization/organization.service';
import { SessionRepo } from '../auth/session.repo';
import { TokenService } from '../auth/token.service';
import { JwtAccessTokenVerifier } from './jwt-access-token.verifier';

const SUB = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const SID = 'a8b6c4d2-1f3e-4a5b-9c7d-0e2f4a6b8c10';

function verifierFailingWith(error: Error): JwtAccessTokenVerifier {
  const tokens = { verifyAccessToken: () => Promise.resolve({ sub: SUB, sid: SID }) } as unknown as TokenService;
  const sessions = { findPrincipalContext: () => Promise.reject(error) } as unknown as SessionRepo;
  const organization = {} as OrganizationService;

  return new JwtAccessTokenVerifier(tokens, sessions, organization);
}

describe('JwtAccessTokenVerifier — database failures', () => {
  it.each([
    new Error('Query read timeout'),
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
  ])('answers "unavailable" (503) when the database cannot be reached: %s', async (error) => {
    await expect(verifierFailingWith(error).verify('token')).rejects.toBeInstanceOf(TokenVerificationUnavailableError);
  });

  // An unexpected failure is a defect, not an outage: it must keep its own identity so it is
  // reported as an internal error instead of being disguised as a retryable 503 (R-04).
  it('does not disguise an unexpected error as an outage', async () => {
    const defect = new TypeError('Cannot read properties of undefined');
    const outcome = await verifierFailingWith(defect)
      .verify('token')
      .catch((error: unknown) => error);

    expect(outcome).toBe(defect);
    expect(outcome).not.toBeInstanceOf(TokenVerificationUnavailableError);
  });
});
