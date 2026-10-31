import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PasswordChangeService } from '../auth/password-change.service';
import {
  AccountNoLongerUsableError,
  CurrentPasswordInvalidError,
  LoginTemporarilyBlockedError,
} from '../auth/auth.errors';
import { PasswordPolicyError } from '../public/identity-access.errors';
import { MeController } from './me.controller';
import { MeService } from './me.service';

const principal = {} as AuthenticatedPrincipal;
const controllerFailingWith = (error: Error): MeController =>
  new MeController({ get: () => Promise.reject(error) } as unknown as MeService, {} as PasswordChangeService);

describe('MeController — failures after the guard (R-15)', () => {
  it.each([new TransientDatabaseError('57014', new Error('timeout')), new Error('Query read timeout')])(
    'answers 503 SERVICE_UNAVAILABLE for an unreachable database: %s',
    async (error) => {
      const outcome = await controllerFailingWith(error)
        .get(principal)
        .catch((caught: unknown) => caught);

      expect(outcome).toBeInstanceOf(ApiException);
      expect((outcome as ApiException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect((outcome as ApiException).getResponse()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    },
  );

  it('keeps any other failure as it is, so it is reported as an internal error', async () => {
    const defect = new Error('An authenticated principal lost its account or employee record');
    await expect(controllerFailingWith(defect).get(principal)).rejects.toBe(defect);
  });
});

// --- error answers of the password change (characterization) -------------------------------------------------

const CURRENT = 'current-password-secret-1';
const NEXT = 'next-password-secret-12';

async function changePasswordRejection(error: Error): Promise<unknown> {
  const controller = new MeController(
    {} as MeService,
    {
      changePassword: () => Promise.reject(error),
    } as unknown as PasswordChangeService,
  );
  try {
    await controller.changePassword(principal, { currentPassword: CURRENT, newPassword: NEXT });
  } catch (caught) {
    return caught;
  }
  throw new Error('changePassword did not fail');
}

describe('MeController — error answers of the password change (status, code, message, details)', () => {
  it.each<[string, () => Error, { status: HttpStatus; body: object }]>([
    [
      'a wrong current password (422, not 401: the caller is still signed in)',
      () => new CurrentPasswordInvalidError(),
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: 'AUTH.CURRENT_PASSWORD_INVALID', message: 'The current password is not correct.' },
      },
    ],
    [
      'a blocked email',
      () => new LoginTemporarilyBlockedError(30),
      {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: {
          code: 'AUTH.LOGIN_TEMPORARILY_BLOCKED',
          message: 'Too many failed sign-in attempts. Try again later.',
          details: { retryAfterSeconds: 30 },
        },
      },
    ],
    [
      'an account that stopped being usable (the same 401 the guard gives next)',
      () => new AccountNoLongerUsableError(),
      {
        status: HttpStatus.UNAUTHORIZED,
        body: { code: 'INVALID_ACCESS_TOKEN', message: 'The access token is invalid.' },
      },
    ],
    [
      'a password the policy refuses',
      () => new PasswordPolicyError('TOO_LONG'),
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: {
          code: 'AUTH.PASSWORD_POLICY_VIOLATION',
          message: 'The password does not meet the policy: TOO_LONG',
          details: { violation: 'TOO_LONG' },
        },
      },
    ],
    [
      'an unavailable database',
      () => new TransientDatabaseError('57014', new Error('timeout')),
      {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        body: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Retry shortly.' },
      },
    ],
    [
      'a driver timeout outside a transaction',
      () => new Error('Connection terminated due to connection timeout'),
      {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        body: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Retry shortly.' },
      },
    ],
  ])('answers %s', async (_case, error, expected) => {
    const caught = await changePasswordRejection(error());

    expect(caught).toBeInstanceOf(ApiException);
    const exception = caught as ApiException;
    expect({ status: exception.getStatus(), body: exception.getResponse() }).toEqual(expected);
    for (const secret of [CURRENT, NEXT]) expect(JSON.stringify(exception.getResponse())).not.toContain(secret);
  });

  it('passes an HTTP answer already made through unchanged', async () => {
    const answer = new ApiException(HttpStatus.CONFLICT, { code: 'SOME.CONFLICT', message: 'Already decided.' });

    await expect(changePasswordRejection(answer)).resolves.toBe(answer);
  });

  it('keeps an unexpected error as it is, so it is reported as an internal error', async () => {
    const defect = new Error('column "nope" does not exist');

    await expect(changePasswordRejection(defect)).resolves.toBe(defect);
  });
});
