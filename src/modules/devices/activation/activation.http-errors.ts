import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  DeviceActivationAlreadyOnDeviceError,
  DeviceActivationKeyNotAllowedError,
  DeviceActivationKeyNotFoundError,
  DeviceActivationKeyNotOfPlanError,
  DeviceActivationKeyRequiredError,
  DeviceActivationKeyWithdrawnError,
  DeviceActivationLotFullError,
  DeviceActivationPlanNotDeviceBoundError,
  DeviceActivationPlanNotFoundError,
  DeviceActivationPurchaseNotActiveError,
} from '../../licensing/public/licensing-device-activation.errors';
import { DeviceAwaitingReturnError, DeviceNotUsableError, DeviceVoidedError } from '../lifecycle/lifecycle.errors';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

const FORBIDDEN = HttpStatus.FORBIDDEN;
const NOT_FOUND = HttpStatus.NOT_FOUND;
const CONFLICT = HttpStatus.CONFLICT;
const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

const ERROR_MAPPINGS: ReadonlyArray<readonly [new () => Error, HttpStatus, string]> = [
  [DeviceNotInChargeError, FORBIDDEN, 'DEVICE.NOT_IN_CHARGE'],
  [DeviceNotFoundError, NOT_FOUND, 'DEVICE.NOT_FOUND'],
  [DeviceVoidedError, CONFLICT, 'DEVICE.VOIDED'],
  [DeviceAlreadyRetiredError, CONFLICT, 'DEVICE.ALREADY_RETIRED'],
  [DeviceAwaitingReturnError, CONFLICT, 'DEVICE.AWAITING_RETURN'],
  [DeviceNotUsableError, CONFLICT, 'DEVICE.NOT_USABLE'],
  [DeviceActivationLotFullError, CONFLICT, 'DEVICE_ACTIVATION.LOT_FULL'],
  [DeviceActivationKeyWithdrawnError, CONFLICT, 'DEVICE_ACTIVATION.KEY_WITHDRAWN'],
  [DeviceActivationPurchaseNotActiveError, CONFLICT, 'DEVICE_ACTIVATION.PURCHASE_NOT_ACTIVE'],
  [DeviceActivationAlreadyOnDeviceError, CONFLICT, 'DEVICE_ACTIVATION.ALREADY_ON_DEVICE'],
  [DeviceActivationPlanNotFoundError, UNPROCESSABLE, 'DEVICE_ACTIVATION.PLAN_NOT_FOUND'],
  [DeviceActivationPlanNotDeviceBoundError, UNPROCESSABLE, 'DEVICE_ACTIVATION.PLAN_NOT_DEVICE_BOUND'],
  [DeviceActivationKeyNotAllowedError, UNPROCESSABLE, 'DEVICE_ACTIVATION.KEY_NOT_ALLOWED'],
  [DeviceActivationKeyRequiredError, UNPROCESSABLE, 'DEVICE_ACTIVATION.KEY_REQUIRED'],
  [DeviceActivationKeyNotFoundError, UNPROCESSABLE, 'DEVICE_ACTIVATION.KEY_NOT_FOUND'],
  [DeviceActivationKeyNotOfPlanError, UNPROCESSABLE, 'DEVICE_ACTIVATION.KEY_NOT_OF_PLAN'],
];

/** Maps machine activation domain errors to HTTP exceptions; database unavailability becomes 503. */
export function toActivationApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  for (const [ErrorType, status, code] of ERROR_MAPPINGS) {
    if (error instanceof ErrorType) return refuse(status, code, error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toActivationApiException(error));

export const ACTIVATION_ERROR_EXAMPLES = {
  NOT_IN_CHARGE: example(new DeviceNotInChargeError()),
  DEVICE_NOT_FOUND: example(new DeviceNotFoundError()),
  VOIDED: example(new DeviceVoidedError()),
  ALREADY_RETIRED: example(new DeviceAlreadyRetiredError()),
  AWAITING_RETURN: example(new DeviceAwaitingReturnError()),
  NOT_USABLE: example(new DeviceNotUsableError()),
  LOT_FULL: example(new DeviceActivationLotFullError()),
  KEY_WITHDRAWN: example(new DeviceActivationKeyWithdrawnError()),
  PURCHASE_NOT_ACTIVE: example(new DeviceActivationPurchaseNotActiveError()),
  ALREADY_ON_DEVICE: example(new DeviceActivationAlreadyOnDeviceError()),
  PLAN_NOT_FOUND: example(new DeviceActivationPlanNotFoundError()),
  PLAN_NOT_DEVICE_BOUND: example(new DeviceActivationPlanNotDeviceBoundError()),
  KEY_NOT_ALLOWED: example(new DeviceActivationKeyNotAllowedError()),
  KEY_REQUIRED: example(new DeviceActivationKeyRequiredError()),
  KEY_NOT_FOUND: example(new DeviceActivationKeyNotFoundError()),
  KEY_NOT_OF_PLAN: example(new DeviceActivationKeyNotOfPlanError()),
} as const;
