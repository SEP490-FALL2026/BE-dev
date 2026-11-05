import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { DeviceRegistrationEndedError, DeviceRegistrationNotFoundError } from '../registry/registry.errors';
import {
  DeviceAcknowledgementNoticeNotCurrentError,
  DeviceAlreadyAcknowledgedError,
  DeviceSignatureRecordMissingError,
} from './acknowledgement.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the acknowledgement route to their HTTP answers; a database that cannot answer is a 503. */
export function toAcknowledgementApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof DeviceRegistrationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEVICE_REGISTRATION.NOT_FOUND', error.message);
  }
  if (error instanceof DeviceRegistrationEndedError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_REGISTRATION.ENDED', error.message);
  }
  if (error instanceof DeviceSignatureRecordMissingError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING', error.message);
  }
  if (error instanceof DeviceAcknowledgementNoticeNotCurrentError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_ACKNOWLEDGEMENT.NOTICE_NOT_CURRENT', error.message);
  }
  if (error instanceof DeviceAlreadyAcknowledgedError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_ACKNOWLEDGEMENT.ALREADY_ACKNOWLEDGED', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toAcknowledgementApiException(error));

export const ACKNOWLEDGEMENT_ERROR_EXAMPLES = {
  REGISTRATION_NOT_FOUND: example(new DeviceRegistrationNotFoundError()),
  REGISTRATION_ENDED: example(new DeviceRegistrationEndedError()),
  SIGNATURE_RECORD_MISSING: example(new DeviceSignatureRecordMissingError()),
  NOTICE_NOT_CURRENT: example(new DeviceAcknowledgementNoticeNotCurrentError()),
  ALREADY_ACKNOWLEDGED: example(new DeviceAlreadyAcknowledgedError()),
} as const;
