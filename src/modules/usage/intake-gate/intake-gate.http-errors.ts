import { HttpStatus } from '@nestjs/common';
import {
  DEVICE_CREDENTIAL_EXPIRED_ERROR,
  DEVICE_CREDENTIAL_INVALID_ERROR,
  DEVICE_CREDENTIAL_REVOKED_ERROR,
  DEVICE_WRONG_COLLECTOR_KIND_ERROR,
} from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { DeviceCredentialRevokedError, DeviceNotFoundError } from '../../devices/public/devices.errors';
import {
  DeviceCollectionStoppedError,
  DeviceNotAcknowledgedError,
  DeviceToolStatusNotAcknowledgedError,
} from './intake-gate.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/**
 * Maps what the intake and the reads of usage can raise to their HTTP answers. The three 403 belong to this gate; 404 is the register's
 * `DEVICE.NOT_FOUND`; a credential revoked between the guard and the transaction is the guard's own 401.
 */
export function toUsageApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof DeviceNotAcknowledgedError)
    return refuse(HttpStatus.FORBIDDEN, 'DEVICE.NOT_ACKNOWLEDGED', error.message);
  if (error instanceof DeviceCollectionStoppedError) {
    return refuse(HttpStatus.FORBIDDEN, 'DEVICE.COLLECTION_STOPPED', error.message);
  }
  if (error instanceof DeviceToolStatusNotAcknowledgedError) {
    return refuse(HttpStatus.FORBIDDEN, 'DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED', error.message);
  }
  if (error instanceof DeviceNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'DEVICE.NOT_FOUND', error.message);
  if (error instanceof DeviceCredentialRevokedError) {
    return new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_REVOKED_ERROR);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toUsageApiException(error));

export const USAGE_ERROR_EXAMPLES = {
  NOT_ACKNOWLEDGED: example(new DeviceNotAcknowledgedError()),
  COLLECTION_STOPPED: example(new DeviceCollectionStoppedError()),
  TOOL_STATUS_NOT_ACKNOWLEDGED: example(new DeviceToolStatusNotAcknowledgedError()),
  DEVICE_NOT_FOUND: example(new DeviceNotFoundError()),
  CREDENTIAL_REVOKED: example(new DeviceCredentialRevokedError()),
  CREDENTIAL_INVALID: errorExampleOf(new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_INVALID_ERROR)),
  CREDENTIAL_EXPIRED: errorExampleOf(new ApiException(HttpStatus.UNAUTHORIZED, DEVICE_CREDENTIAL_EXPIRED_ERROR)),
  WRONG_COLLECTOR_KIND: errorExampleOf(new ApiException(HttpStatus.FORBIDDEN, DEVICE_WRONG_COLLECTOR_KIND_ERROR)),
} as const;
