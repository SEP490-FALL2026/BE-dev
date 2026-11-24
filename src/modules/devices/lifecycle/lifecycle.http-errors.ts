import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import {
  DeviceAlreadyRetiredError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DeviceHolderUnchangedError,
  DeviceRegistrationOverlapError,
} from '../registry/registry.errors';
import {
  DeviceAwaitingReturnError,
  DeviceNotHeldError,
  DeviceNotUsableError,
  DeviceReturnTaskNotInChargeError,
  DeviceSoftwareRemovalNoteRequiredError,
  DeviceSoftwareRemovalRequiredError,
  DeviceVoidedError,
} from './lifecycle.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

const FORBIDDEN = HttpStatus.FORBIDDEN;
const NOT_FOUND = HttpStatus.NOT_FOUND;
const CONFLICT = HttpStatus.CONFLICT;
const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

const ERROR_MAPPINGS: ReadonlyArray<readonly [new () => Error, HttpStatus, string]> = [
  [DeviceNotInChargeError, FORBIDDEN, 'DEVICE.NOT_IN_CHARGE'],
  [DeviceReturnTaskNotInChargeError, FORBIDDEN, 'DEVICE_RETURN_TASK.NOT_IN_CHARGE'],
  [DeviceNotFoundError, NOT_FOUND, 'DEVICE.NOT_FOUND'],
  [DeviceVoidedError, CONFLICT, 'DEVICE.VOIDED'],
  [DeviceAlreadyRetiredError, CONFLICT, 'DEVICE.ALREADY_RETIRED'],
  [DeviceAwaitingReturnError, CONFLICT, 'DEVICE.AWAITING_RETURN'],
  [DeviceNotUsableError, CONFLICT, 'DEVICE.NOT_USABLE'],
  [DeviceNotHeldError, CONFLICT, 'DEVICE.NOT_HELD'],
  [DeviceHolderUnchangedError, CONFLICT, 'DEVICE.HOLDER_UNCHANGED'],
  [DeviceHolderNotWorkingError, CONFLICT, 'DEVICE.HOLDER_NOT_WORKING'],
  [DeviceRegistrationOverlapError, CONFLICT, 'DEVICE.REGISTRATION_OVERLAP'],
  [DeviceHolderNotFoundError, UNPROCESSABLE, 'DEVICE.HOLDER_NOT_FOUND'],
  [DeviceSoftwareRemovalRequiredError, UNPROCESSABLE, 'DEVICE.SOFTWARE_REMOVAL_REQUIRED'],
  [DeviceSoftwareRemovalNoteRequiredError, UNPROCESSABLE, 'DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED'],
];

/** Maps lifecycle domain errors to HTTP answers; database unavailability becomes 503. */
export function toLifecycleApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  for (const [ErrorType, status, code] of ERROR_MAPPINGS) {
    if (error instanceof ErrorType) return refuse(status, code, error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toLifecycleApiException(error));

export const LIFECYCLE_ERROR_EXAMPLES = {
  NOT_IN_CHARGE: example(new DeviceNotInChargeError()),
  RETURN_TASK_NOT_IN_CHARGE: example(new DeviceReturnTaskNotInChargeError()),
  DEVICE_NOT_FOUND: example(new DeviceNotFoundError()),
  VOIDED: example(new DeviceVoidedError()),
  ALREADY_RETIRED: example(new DeviceAlreadyRetiredError()),
  AWAITING_RETURN: example(new DeviceAwaitingReturnError()),
  NOT_USABLE: example(new DeviceNotUsableError()),
  NOT_HELD: example(new DeviceNotHeldError()),
  HOLDER_UNCHANGED: example(new DeviceHolderUnchangedError()),
  HOLDER_NOT_WORKING: example(new DeviceHolderNotWorkingError()),
  REGISTRATION_OVERLAP: example(new DeviceRegistrationOverlapError()),
  HOLDER_NOT_FOUND: example(new DeviceHolderNotFoundError()),
  SOFTWARE_REMOVAL_REQUIRED: example(new DeviceSoftwareRemovalRequiredError()),
  SOFTWARE_REMOVAL_NOTE_REQUIRED: example(new DeviceSoftwareRemovalNoteRequiredError()),
} as const;
