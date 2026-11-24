import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  DeviceReturnTaskAlreadyClosedError,
  DeviceReturnTaskNotFoundError,
  DeviceReturnTaskOutcomeFieldsInvalidError,
  DeviceReturnTaskSoftwareRemovalNoteRequiredError,
} from './device-return-task.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

const ERROR_MAPPINGS: ReadonlyArray<readonly [new () => Error, HttpStatus, string]> = [
  [DeviceReturnTaskNotFoundError, HttpStatus.NOT_FOUND, 'DEVICE_RETURN_TASK.NOT_FOUND'],
  [DeviceReturnTaskAlreadyClosedError, HttpStatus.CONFLICT, 'DEVICE_RETURN_TASK.ALREADY_CLOSED'],
  [
    DeviceReturnTaskOutcomeFieldsInvalidError,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'DEVICE_RETURN_TASK.OUTCOME_FIELDS_INVALID',
  ],
  [
    DeviceReturnTaskSoftwareRemovalNoteRequiredError,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'DEVICE_RETURN_TASK.SOFTWARE_REMOVAL_NOTE_REQUIRED',
  ],
];

/** Maps device return-task errors to HTTP exceptions; falls back to `null` for non-task errors. */
export function mapDeviceReturnTaskError(error: unknown): ApiException | null {
  if (error instanceof ApiException) return error;
  for (const [ErrorType, status, code] of ERROR_MAPPINGS) {
    if (error instanceof ErrorType) return refuse(status, code, error.message);
  }

  return toUnavailableApiException(error) ?? null;
}

/** Maps device return-task query errors to HTTP exceptions. */
export function toDeviceReturnTaskApiException(error: unknown): unknown {
  return mapDeviceReturnTaskError(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toDeviceReturnTaskApiException(error));

export const DEVICE_RETURN_TASK_ERROR_EXAMPLES = {
  NOT_FOUND: example(new DeviceReturnTaskNotFoundError()),
  ALREADY_CLOSED: example(new DeviceReturnTaskAlreadyClosedError()),
  OUTCOME_FIELDS_INVALID: example(new DeviceReturnTaskOutcomeFieldsInvalidError()),
  SOFTWARE_REMOVAL_NOTE_REQUIRED: example(new DeviceReturnTaskSoftwareRemovalNoteRequiredError()),
} as const;
