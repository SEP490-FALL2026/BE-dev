import { AccountInvitationService } from '../accounts/account-invitation.service';
import { sessionTokenSchema } from '../dto/auth.dto';
import { IssuedSession } from '../identity-access.types';
import { AuthController } from './auth.controller';
import { LoginService } from './login.service';
import { PasswordResetService } from './password-reset.service';
import { SessionService } from './session.service';

const issued: IssuedSession = {
  accessToken: 'access-token-placeholder',
  accessTokenExpiresAt: new Date('2026-10-18T10:10:00.000Z'),
  refreshToken: 'refresh-token-placeholder',
  refreshTokenExpiresAt: new Date('2026-10-18T18:00:00.000Z'),
};

const controller = new AuthController(
  { login: () => Promise.resolve(issued) } as unknown as LoginService,
  { refresh: () => Promise.resolve(issued) } as unknown as SessionService,
  {} as AccountInvitationService,
  {} as PasswordResetService,
);

describe('AuthController — session token wire shape', () => {
  it.each([
    ['login', () => controller.login({ email: 'a@acme.vn', password: 'p' })],
    ['refresh', () => controller.refresh({ refreshToken: 'r' })],
  ])('%s returns both expiries as ISO-8601, each from its own credential', async (_route, call) => {
    const tokens = await call();

    expect(tokens).toEqual({
      accessToken: 'access-token-placeholder',
      tokenType: 'Bearer',
      expiresAt: '2026-10-18T10:10:00.000Z',
      refreshToken: 'refresh-token-placeholder',
      refreshExpiresAt: '2026-10-18T18:00:00.000Z',
    });
    // The response is validated against the published schema; the mapper must satisfy it.
    expect(sessionTokenSchema.safeParse(tokens).success).toBe(true);
  });
});
