import { HttpStatus } from '@nestjs/common';
import {
  DEVICE_CREDENTIAL_EXPIRED_ERROR,
  DEVICE_CREDENTIAL_INVALID_ERROR,
  DEVICE_CREDENTIAL_REVOKED_ERROR,
} from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { DeviceCredentialRevokedError } from '../public/devices.errors';
import {
  CredentialRegistrationEndedError,
  CredentialRegistrationNotFoundError,
  CredentialSignatureRecordMissingError,
  DeviceCredentialAlreadyRevokedError,
  DeviceCredentialExpiredError,
  DeviceCredentialInvalidError,
  DeviceCredentialNotFoundError,
  DeviceEnrollmentCodeInvalidError,
} from './credential.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the code, enrollment, session and credential routes to their HTTP answers; a database that cannot answer is a 503. */
export function toCredentialApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof DeviceEnrollmentCodeInvalidError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEVICE_ENROLLMENT.CODE_INVALID', error.message);
  }
  if (error instanceof DeviceCredentialNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEVICE_CREDENTIAL.NOT_FOUND', error.message);
  }
  if (error instanceof CredentialRegistrationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEVICE_REGISTRATION.NOT_FOUND', error.message);
  }
  if (error instanceof DeviceCredentialAlreadyRevokedError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_CREDENTIAL.ALREADY_REVOKED', error.message);
  }
  if (error instanceof CredentialRegistrationEndedError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_REGISTRATION.ENDED', error.message);
  }
  if (error instanceof CredentialSignatureRecordMissingError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING', error.message);
  }
  // The answers of the guard, given again when the credential changed between the guard and the use case.
  if (error instanceof DeviceCredentialRevokedError) {
    return new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_REVOKED_ERROR);
  }
  if (error instanceof DeviceCredentialExpiredError) {
    return new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_EXPIRED_ERROR);
  }
  if (error instanceof DeviceCredentialInvalidError) {
    return new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_INVALID_ERROR);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toCredentialApiException(error));

export const CREDENTIAL_ERROR_EXAMPLES = {
  CODE_INVALID: example(new DeviceEnrollmentCodeInvalidError()),
  CREDENTIAL_NOT_FOUND: example(new DeviceCredentialNotFoundError()),
  REGISTRATION_NOT_FOUND: example(new CredentialRegistrationNotFoundError()),
  ALREADY_REVOKED: example(new DeviceCredentialAlreadyRevokedError()),
  REGISTRATION_ENDED: example(new CredentialRegistrationEndedError()),
  SIGNATURE_RECORD_MISSING: example(new CredentialSignatureRecordMissingError()),
  CREDENTIAL_INVALID: example(new DeviceCredentialInvalidError()),
  CREDENTIAL_REVOKED: example(new DeviceCredentialRevokedError()),
  CREDENTIAL_EXPIRED: example(new DeviceCredentialExpiredError()),
} as const;
