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

/**
 * The answers of the device guard. A device that is told `REVOKED` or `EXPIRED` deletes its credential and asks for a new code; one told
 * `INVALID` keeps what it has and reports to the IT Admin, so the three are never mixed.
 */
export const DEVICE_CREDENTIAL_INVALID_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'DEVICE.CREDENTIAL_INVALID',
  message: 'A valid device credential is required.',
});

export const DEVICE_CREDENTIAL_REVOKED_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'DEVICE.CREDENTIAL_REVOKED',
  message: 'The device credential was revoked.',
});

export const DEVICE_CREDENTIAL_EXPIRED_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'DEVICE.CREDENTIAL_EXPIRED',
  message: 'The device credential has expired.',
});

export const DEVICE_WRONG_COLLECTOR_KIND_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'DEVICE.WRONG_COLLECTOR_KIND',
  message: 'This credential was issued to another kind of collector.',
});
