import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import {
  AccountNoLongerUsableError,
  CurrentPasswordInvalidError,
  InvalidCredentialsError,
  LoginTemporarilyBlockedError,
  PasswordResetInvalidError,
  SessionInvalidError,
} from '../auth/auth.errors';
import { PasswordPolicyError } from '../identity-access.errors';

// Shared by the auth routes (auth/) and the password change of the signed-in account (access/).

function refuse(status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/** The same 429 at sign-in and at a password change: the email is blocked after too many wrong passwords. */
function loginBlocked(error: LoginTemporarilyBlockedError): ApiException {
  return refuse(HttpStatus.TOO_MANY_REQUESTS, 'AUTH.LOGIN_TEMPORARILY_BLOCKED', error.message, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
}

/** 503 of the public auth routes: an outage is never reported as a failed sign-in. */
function authUnavailable(): ApiException {
  return refuse(
    HttpStatus.SERVICE_UNAVAILABLE,
    'AUTH.UNAVAILABLE',
    'Authentication is temporarily unavailable. Retry shortly.',
  );
}

/**
 * Sign-in, refresh, sign-out and the reset request. Only a TransientDatabaseError becomes 503 (AUTH.UNAVAILABLE);
 * anything else not listed, a raw driver error included, is returned unchanged for the global filter.
 */
export function toAuthApiException(error: unknown): unknown {
  if (error instanceof InvalidCredentialsError) {
    return refuse(HttpStatus.UNAUTHORIZED, 'AUTH.INVALID_CREDENTIALS', 'The email or password is not valid.');
  }
  if (error instanceof LoginTemporarilyBlockedError) return loginBlocked(error);
  if (error instanceof SessionInvalidError) {
    return refuse(HttpStatus.UNAUTHORIZED, 'AUTH.SESSION_INVALID', 'The session is not valid. Sign in again.');
  }
  if (error instanceof TransientDatabaseError) return authUnavailable();

  return error;
}

/**
 * Setting a password: a reset link, a change of the own password and an invitation's first password. An outage is
 * 503 SERVICE_UNAVAILABLE; anything else not listed is returned unchanged for the global filter.
 */
export function toPasswordApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof LoginTemporarilyBlockedError) return loginBlocked(error);
  // 422, not 401: the caller is signed in, and 401 is what tells a client the session ended.
  if (error instanceof CurrentPasswordInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'AUTH.CURRENT_PASSWORD_INVALID', error.message);
  }
  // The same answer the guard gives from the next request on.
  if (error instanceof AccountNoLongerUsableError) {
    return refuse(HttpStatus.UNAUTHORIZED, 'INVALID_ACCESS_TOKEN', 'The access token is invalid.');
  }
  if (error instanceof PasswordResetInvalidError) {
    return refuse(HttpStatus.BAD_REQUEST, 'AUTH.PASSWORD_RESET_INVALID', 'The password reset link is not valid.');
  }
  if (error instanceof PasswordPolicyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'AUTH.PASSWORD_POLICY_VIOLATION', error.message, {
      violation: error.violation,
    });
  }

  return toUnavailableApiException(error) ?? error;
}

/** The public reset route: an outage is AUTH.UNAVAILABLE, like sign-in and refresh; the rest as any password change. */
export function toPasswordResetApiException(error: unknown): unknown {
  if (error instanceof TransientDatabaseError) return authUnavailable();

  return toPasswordApiException(error);
}
