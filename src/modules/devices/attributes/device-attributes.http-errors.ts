import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { DeviceNotFoundError } from '../public/devices.errors';
import {
  DeviceNotEditableError,
  DeviceSerialNumberTakenError,
  DeviceStaleError,
  DeviceUpdateEmptyError,
} from './device-attributes.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the correction of a machine to their HTTP answers; a database that cannot answer is a 503. */
export function toDeviceAttributesApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof DeviceNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'DEVICE.NOT_FOUND', error.message);
  if (error instanceof DeviceUpdateEmptyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEVICE.UPDATE_EMPTY', error.message);
  }
  if (error instanceof DeviceNotEditableError) {
    // The codes the SPEC names: a machine taken out of use is DEVICE.ALREADY_RETIRED (as on the register), a voided record DEVICE.VOIDED.
    return refuse(
      HttpStatus.CONFLICT,
      error.reason === 'VOIDED' ? 'DEVICE.VOIDED' : 'DEVICE.ALREADY_RETIRED',
      error.message,
    );
  }
  if (error instanceof DeviceStaleError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE.STALE', error.message, {
      currentUpdatedAt: error.currentUpdatedAt.toISOString(),
    });
  }
  if (error instanceof DeviceSerialNumberTakenError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE.SERIAL_TAKEN', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toDeviceAttributesApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const DEVICE_ATTRIBUTES_ERROR_EXAMPLES = {
  NOT_FOUND: example(new DeviceNotFoundError()),
  UPDATE_EMPTY: example(new DeviceUpdateEmptyError()),
  ALREADY_RETIRED: example(new DeviceNotEditableError('RETIRED')),
  VOIDED: example(new DeviceNotEditableError('VOIDED')),
  // The same stand-in date as `SUBSCRIPTION.STALE`: an example never carries a real timestamp.
  STALE: example(new DeviceStaleError(new Date('2026-01-01T00:00:00.000Z'))),
  SERIAL_TAKEN: example(new DeviceSerialNumberTakenError()),
} as const;
