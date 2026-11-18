import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InvalidAccessTokenError } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { TokenService } from './token.service';

const SECRET = 'unit-test-secret-unit-test-secret-unit-test';
const SUB = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const SID = 'a8b6c4d2-1f3e-4a5b-9c7d-0e2f4a6b8c10';

describe('TokenService.verifyAccessToken', () => {
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256', issuer: 'slm-api', audience: 'slm-web', expiresIn: 900 },
    verifyOptions: { algorithms: ['HS256'], issuer: 'slm-api', audience: 'slm-web' },
  });
  const tokens = new TokenService(jwt, new ConfigService({}) as never);
  const sign = (payload: Record<string, unknown>, subject: string | null = SUB) =>
    jwt.signAsync(payload, subject === null ? {} : { subject });

  it('returns the claims of a well-formed token', async () => {
    await expect(tokens.verifyAccessToken(await sign({ sid: SID }))).resolves.toEqual({ sub: SUB, sid: SID });
  });

  // A correctly signed token whose ids are not UUIDs must be refused as a bad token (401), not
  // passed on to the database, where the malformed id would surface as a 503 and an error log.
  it.each([
    ['sid is not a UUID', { sid: 'not-a-uuid' }, SUB],
    ['sid is a number', { sid: 42 }, SUB],
    ['sid is missing', {}, SUB],
    ['sub is not a UUID', { sid: SID }, 'not-a-uuid'],
    ['sub is missing', { sid: SID }, null],
  ])('refuses a signed token when %s', async (_name, payload, subject) => {
    await expect(tokens.verifyAccessToken(await sign(payload, subject))).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('refuses a token signed with another key', async () => {
    const other = new JwtService({ secret: 'another-secret-another-secret-another-secret' });
    const forged = await other.signAsync({ sid: SID }, { subject: SUB });
    await expect(tokens.verifyAccessToken(forged)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});
