import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { InvitationRedemptionService } from '../accounts/invitation-redemption.service';
import { sessionTokenSchema } from '../dto/auth.dto';
import { InvitationInvalidError } from '../accounts/account.errors';
import { PasswordPolicyError } from '../public/identity-access.errors';
import { IssuedSession } from '../public/identity-access.types';
import { AuthController } from './auth.controller';
import {
  InvalidCredentialsError,
  LoginTemporarilyBlockedError,
  PasswordResetInvalidError,
  SessionInvalidError,
} from './auth.errors';
import { LoginService } from './login.service';
import { PasswordResetRequestService } from './password-reset-request.service';
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
  {} as InvitationRedemptionService,
  {} as PasswordResetRequestService,
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

// --- error answers of every auth route (H5.0 characterization) ---------------------------------------------------

/** Credentials sent in the bodies below; no error answer may echo them. */
const PASSWORD = 'correct-horse-battery-staple-1';
const TOKEN = 'secret-link-token-value';
const REFRESH_TOKEN = 'secret-refresh-token-value';

/** The controller with every service failing with `error`. */
function failingWith(error: Error): AuthController {
  const fail = () => Promise.reject(error);

  return new AuthController(
    { login: fail } as unknown as LoginService,
    { refresh: fail, logout: fail } as unknown as SessionService,
    { redeemInvitation: fail } as unknown as InvitationRedemptionService,
    { requestReset: fail } as unknown as PasswordResetRequestService,
    { resetPassword: fail } as unknown as PasswordResetService,
  );
}

const routes = {
  login: (c: AuthController) => c.login({ email: 'person@acme.vn', password: PASSWORD }),
  refresh: (c: AuthController) => c.refresh({ refreshToken: REFRESH_TOKEN }),
  logout: (c: AuthController) => c.logout({ refreshToken: REFRESH_TOKEN }),
  requestPasswordReset: (c: AuthController) => c.requestPasswordReset({ email: 'person@acme.vn' }),
  resetPassword: (c: AuthController) => c.resetPassword({ token: TOKEN, newPassword: PASSWORD }),
  redeemInvitation: (c: AuthController) => c.redeemInvitation({ token: TOKEN, password: PASSWORD }),
};
type Route = keyof typeof routes;

async function rejectionOf(route: Route, error: Error): Promise<unknown> {
  try {
    await routes[route](failingWith(error));
  } catch (caught) {
    return caught;
  }
  throw new Error(`${route} did not fail`);
}

const AUTH_UNAVAILABLE = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  body: { code: 'AUTH.UNAVAILABLE', message: 'Authentication is temporarily unavailable. Retry shortly.' },
};
const SERVICE_UNAVAILABLE = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  body: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Retry shortly.' },
};
const POLICY_VIOLATION = (violation: string) => ({
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  body: {
    code: 'AUTH.PASSWORD_POLICY_VIOLATION',
    message: `The password does not meet the policy: ${violation}`,
    details: { violation },
  },
});

const transient = () => new TransientDatabaseError('57014', new Error('canceling statement due to statement timeout'));
/** The driver's own timeout from a read outside a transaction (not a TransientDatabaseError). */
const driverTimeout = () => new Error('Query read timeout');

const mapped: [Route, string, () => Error, { status: HttpStatus; body: object }][] = [
  [
    'login',
    'invalid credentials',
    () => new InvalidCredentialsError(),
    {
      status: HttpStatus.UNAUTHORIZED,
      body: { code: 'AUTH.INVALID_CREDENTIALS', message: 'The email or password is not valid.' },
    },
  ],
  [
    'login',
    'a blocked email',
    () => new LoginTemporarilyBlockedError(42),
    {
      status: HttpStatus.TOO_MANY_REQUESTS,
      body: {
        code: 'AUTH.LOGIN_TEMPORARILY_BLOCKED',
        message: 'Too many failed sign-in attempts. Try again later.',
        details: { retryAfterSeconds: 42 },
      },
    },
  ],
  ['login', 'an unavailable database', transient, AUTH_UNAVAILABLE],
  [
    'refresh',
    'an unusable session',
    () => new SessionInvalidError(),
    {
      status: HttpStatus.UNAUTHORIZED,
      body: { code: 'AUTH.SESSION_INVALID', message: 'The session is not valid. Sign in again.' },
    },
  ],
  ['refresh', 'an unavailable database', transient, AUTH_UNAVAILABLE],
  ['logout', 'an unavailable database', transient, AUTH_UNAVAILABLE],
  ['requestPasswordReset', 'an unavailable database', transient, AUTH_UNAVAILABLE],
  [
    'resetPassword',
    'an unusable reset link',
    () => new PasswordResetInvalidError(),
    {
      status: HttpStatus.BAD_REQUEST,
      body: { code: 'AUTH.PASSWORD_RESET_INVALID', message: 'The password reset link is not valid.' },
    },
  ],
  [
    'resetPassword',
    'a password the policy refuses',
    () => new PasswordPolicyError('TOO_SHORT'),
    POLICY_VIOLATION('TOO_SHORT'),
  ],
  ['resetPassword', 'an unavailable database', transient, AUTH_UNAVAILABLE],
  ['resetPassword', 'a driver timeout outside a transaction', driverTimeout, SERVICE_UNAVAILABLE],
  [
    'redeemInvitation',
    'an unusable invitation link',
    () => new InvitationInvalidError(),
    {
      status: HttpStatus.BAD_REQUEST,
      body: { code: 'AUTH.INVITATION_INVALID', message: 'The invitation link is not valid.' },
    },
  ],
  [
    'redeemInvitation',
    'a password the policy refuses',
    () => new PasswordPolicyError('EQUALS_LOGIN_EMAIL'),
    POLICY_VIOLATION('EQUALS_LOGIN_EMAIL'),
  ],
  // Not AUTH.UNAVAILABLE: the invitation route answers an outage like account administration does.
  ['redeemInvitation', 'an unavailable database', transient, SERVICE_UNAVAILABLE],
  ['redeemInvitation', 'a driver timeout outside a transaction', driverTimeout, SERVICE_UNAVAILABLE],
];

describe('AuthController — error answers (status, code, message, details)', () => {
  it.each(mapped)('%s answers %s', async (route, _case, error, expected) => {
    const caught = await rejectionOf(route, error());

    expect(caught).toBeInstanceOf(ApiException);
    const exception = caught as ApiException;
    expect({ status: exception.getStatus(), body: exception.getResponse() }).toEqual(expected);
    // An error answer never carries the credentials the request sent.
    for (const secret of [PASSWORD, TOKEN, REFRESH_TOKEN])
      expect(JSON.stringify(exception.getResponse())).not.toContain(secret);
  });

  const allRoutes = Object.keys(routes) as Route[];

  it.each(allRoutes)('%s passes an HTTP answer already made through unchanged', async (route) => {
    const answer = new ApiException(HttpStatus.CONFLICT, { code: 'SOME.CONFLICT', message: 'Already decided.' });

    await expect(rejectionOf(route, answer)).resolves.toBe(answer);
  });

  it.each(allRoutes)('%s keeps an unexpected error as it is, so it is reported as an internal error', async (route) => {
    const defect = new Error('column "nope" does not exist');

    await expect(rejectionOf(route, defect)).resolves.toBe(defect);
  });

  // The session routes map only TransientDatabaseError to 503; a raw driver error stays an internal error.
  it.each(['login', 'refresh', 'logout', 'requestPasswordReset'] as const)(
    '%s keeps a driver error that is not a TransientDatabaseError as it is',
    async (route) => {
      const driverError = driverTimeout();

      await expect(rejectionOf(route, driverError)).resolves.toBe(driverError);
    },
  );
});
