import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toActivationApiException } from '../activation/activation.http-errors';
import { toRegistryApiException } from '../registry/registry.http-errors';
import { DeviceAssetCodeInvalidError, DeviceInitializationClosedError } from './initial-record.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps initial device intake errors to HTTP exceptions, delegating shared registry and activation errors. */
export function toInitialRecordApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof DeviceInitializationClosedError) {
    return refuse(HttpStatus.CONFLICT, 'DEVICE.INITIALIZATION_CLOSED', error.message);
  }
  if (error instanceof DeviceAssetCodeInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEVICE.ASSET_CODE_INVALID', error.message);
  }

  const registryMapped = toRegistryApiException(error);
  if (registryMapped !== error) return registryMapped;

  return toActivationApiException(error);
}

const example = (error: Error) => errorExampleOf(toInitialRecordApiException(error));

export const INITIAL_RECORD_ERROR_EXAMPLES = {
  INITIALIZATION_CLOSED: example(new DeviceInitializationClosedError()),
  ASSET_CODE_INVALID: example(new DeviceAssetCodeInvalidError()),
} as const;
