import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { DeviceRegistrationEndedError, DeviceRegistrationNotFoundError } from '../registry/registry.errors';
import {
  DeviceStopRequestNotFoundError,
  DeviceStopRequestNotInChargeError,
  DeviceStopRequestNotOpenError,
} from './stop-request.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the routes of stopping collection to their HTTP answers; a database that cannot answer is a 503. */
export function toStopRequestApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof DeviceRegistrationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEVICE_REGISTRATION.NOT_FOUND', error.message);
  }
  if (error instanceof DeviceRegistrationEndedError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_REGISTRATION.ENDED', error.message);
  }
  if (error instanceof DeviceStopRequestNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEVICE_STOP_REQUEST.NOT_FOUND', error.message);
  }
  if (error instanceof DeviceStopRequestNotOpenError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE_STOP_REQUEST.NOT_OPEN', error.message, { state: error.state });
  }
  if (error instanceof DeviceStopRequestNotInChargeError) {
    return refuse(HttpStatus.FORBIDDEN, 'DEVICE_STOP_REQUEST.NOT_IN_CHARGE', error.message);
  }
  if (error instanceof EmployeeNotStartedError) {
    return refuse(HttpStatus.CONFLICT, 'EMPLOYEE.NOT_STARTED', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toStopRequestApiException(error));

export const STOP_REQUEST_ERROR_EXAMPLES = {
  REGISTRATION_NOT_FOUND: example(new DeviceRegistrationNotFoundError()),
  REGISTRATION_ENDED: example(new DeviceRegistrationEndedError()),
  STOP_REQUEST_NOT_FOUND: example(new DeviceStopRequestNotFoundError()),
  STOP_REQUEST_NOT_OPEN: example(new DeviceStopRequestNotOpenError('COMPLETED')),
  NOT_IN_CHARGE: example(new DeviceStopRequestNotInChargeError()),
  EMPLOYEE_NOT_STARTED: example(new EmployeeNotStartedError()),
} as const;
