import type { ApiErrorBody } from './api.exception';

/**
 * The answers of the authentication and authorization guards. The guards throw exactly these bodies and the OpenAPI
 * document shows them as the examples of every guarded route, so the two cannot drift apart.
 */
export const AUTHENTICATION_REQUIRED_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'AUTHENTICATION_REQUIRED',
  message: 'A Bearer access token is required.',
});

/** The wire message is fixed rather than the verifier's own, which is internal detail. */
export const INVALID_ACCESS_TOKEN_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'INVALID_ACCESS_TOKEN',
  message: 'The access token is invalid.',
});

export const TOKEN_VERIFICATION_UNAVAILABLE_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'TOKEN_VERIFICATION_UNAVAILABLE',
  message: 'Authentication is temporarily unavailable. Retry shortly.',
});

export const FORBIDDEN_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'AUTHORIZATION.FORBIDDEN',
  message: 'You do not have permission to perform this action.',
});
