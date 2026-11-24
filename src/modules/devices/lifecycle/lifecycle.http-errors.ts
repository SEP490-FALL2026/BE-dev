import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  DeviceActivationAlreadyClosedError,
  DeviceActivationAlreadyOnDeviceError,
  DeviceActivationKeyWithdrawnError,
  DeviceActivationLotFullError,
  DeviceActivationNotFoundError,
  DeviceActivationNotMovableError,
  DeviceActivationNotOnDeviceError,
  DeviceActivationPurchaseNotActiveError,
  DeviceActivationReleaseNotApplicableError,
} from '../../licensing/public/licensing-device-activation.errors';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import {
  DeviceAlreadyRetiredError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DeviceHolderUnchangedError,
  DeviceRegistrationOverlapError,
} from '../registry/registry.errors';
import {
  DeviceAwaitingReturnError,
  DeviceConditionUnchangedError,
  DeviceNotHeldError,
  DeviceNotUsableError,
  DeviceReplacementNotInStockError,
  DeviceReturnTaskNotInChargeError,
  DeviceSameDeviceError,
  DeviceSoftwareRemovalNoteRequiredError,
  DeviceSoftwareRemovalRequiredError,
  DeviceVoidedError,
  DeviceVoidRefusedError,
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
  [DeviceActivationNotFoundError, NOT_FOUND, 'DEVICE_ACTIVATION.NOT_FOUND'],
  [DeviceVoidedError, CONFLICT, 'DEVICE.VOIDED'],
  [DeviceAlreadyRetiredError, CONFLICT, 'DEVICE.ALREADY_RETIRED'],
  [DeviceAwaitingReturnError, CONFLICT, 'DEVICE.AWAITING_RETURN'],
  [DeviceNotUsableError, CONFLICT, 'DEVICE.NOT_USABLE'],
  [DeviceNotHeldError, CONFLICT, 'DEVICE.NOT_HELD'],
  [DeviceReplacementNotInStockError, CONFLICT, 'DEVICE.REPLACEMENT_NOT_IN_STOCK'],
  [DeviceHolderUnchangedError, CONFLICT, 'DEVICE.HOLDER_UNCHANGED'],
  [DeviceHolderNotWorkingError, CONFLICT, 'DEVICE.HOLDER_NOT_WORKING'],
  [DeviceRegistrationOverlapError, CONFLICT, 'DEVICE.REGISTRATION_OVERLAP'],
  [DeviceConditionUnchangedError, CONFLICT, 'DEVICE.CONDITION_UNCHANGED'],
  [DeviceActivationAlreadyClosedError, CONFLICT, 'DEVICE_ACTIVATION.ALREADY_CLOSED'],
  [DeviceActivationAlreadyOnDeviceError, CONFLICT, 'DEVICE_ACTIVATION.ALREADY_ON_DEVICE'],
  [DeviceActivationKeyWithdrawnError, CONFLICT, 'DEVICE_ACTIVATION.KEY_WITHDRAWN'],
  [DeviceActivationLotFullError, CONFLICT, 'DEVICE_ACTIVATION.LOT_FULL'],
  [DeviceActivationPurchaseNotActiveError, CONFLICT, 'DEVICE_ACTIVATION.PURCHASE_NOT_ACTIVE'],
  [DeviceHolderNotFoundError, UNPROCESSABLE, 'DEVICE.HOLDER_NOT_FOUND'],
  [DeviceSoftwareRemovalRequiredError, UNPROCESSABLE, 'DEVICE.SOFTWARE_REMOVAL_REQUIRED'],
  [DeviceSoftwareRemovalNoteRequiredError, UNPROCESSABLE, 'DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED'],
  [DeviceSameDeviceError, UNPROCESSABLE, 'DEVICE.SAME_DEVICE'],
  [DeviceActivationNotOnDeviceError, UNPROCESSABLE, 'DEVICE_ACTIVATION.NOT_ON_DEVICE'],
  [DeviceActivationNotMovableError, UNPROCESSABLE, 'DEVICE_ACTIVATION.NOT_MOVABLE'],
  [DeviceActivationReleaseNotApplicableError, UNPROCESSABLE, 'DEVICE_ACTIVATION.RELEASE_NOT_APPLICABLE'],
];

/** Maps lifecycle domain errors to HTTP answers; database unavailability becomes 503. */
export function toLifecycleApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof EmployeeNotStartedError) {
    return refuse(CONFLICT, 'EMPLOYEE.NOT_STARTED', error.message);
  }
  if (error instanceof DeviceVoidRefusedError) {
    return new ApiException(CONFLICT, {
      code: 'DEVICE.VOID_REFUSED',
      message: error.message,
      details: { reason: error.reason },
    });
  }
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
  ACTIVATION_NOT_FOUND: example(new DeviceActivationNotFoundError()),
  VOIDED: example(new DeviceVoidedError()),
  ALREADY_RETIRED: example(new DeviceAlreadyRetiredError()),
  AWAITING_RETURN: example(new DeviceAwaitingReturnError()),
  NOT_USABLE: example(new DeviceNotUsableError()),
  NOT_HELD: example(new DeviceNotHeldError()),
  REPLACEMENT_NOT_IN_STOCK: example(new DeviceReplacementNotInStockError()),
  VOID_REFUSED: example(new DeviceVoidRefusedError('HELD')),
  HOLDER_UNCHANGED: example(new DeviceHolderUnchangedError()),
  HOLDER_NOT_WORKING: example(new DeviceHolderNotWorkingError()),
  REGISTRATION_OVERLAP: example(new DeviceRegistrationOverlapError()),
  CONDITION_UNCHANGED: example(new DeviceConditionUnchangedError()),
  ACTIVATION_ALREADY_CLOSED: example(new DeviceActivationAlreadyClosedError()),
  ACTIVATION_ALREADY_ON_DEVICE: example(new DeviceActivationAlreadyOnDeviceError()),
  ACTIVATION_KEY_WITHDRAWN: example(new DeviceActivationKeyWithdrawnError()),
  ACTIVATION_LOT_FULL: example(new DeviceActivationLotFullError()),
  ACTIVATION_PURCHASE_NOT_ACTIVE: example(new DeviceActivationPurchaseNotActiveError()),
  HOLDER_NOT_FOUND: example(new DeviceHolderNotFoundError()),
  SOFTWARE_REMOVAL_REQUIRED: example(new DeviceSoftwareRemovalRequiredError()),
  SOFTWARE_REMOVAL_NOTE_REQUIRED: example(new DeviceSoftwareRemovalNoteRequiredError()),
  SAME_DEVICE: example(new DeviceSameDeviceError()),
  ACTIVATION_NOT_ON_DEVICE: example(new DeviceActivationNotOnDeviceError()),
  ACTIVATION_NOT_MOVABLE: example(new DeviceActivationNotMovableError()),
  ACTIVATION_RELEASE_NOT_APPLICABLE: example(new DeviceActivationReleaseNotApplicableError()),
  EMPLOYEE_NOT_STARTED: example(new EmployeeNotStartedError()),
} as const;
