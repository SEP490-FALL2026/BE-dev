import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError, toTransientError } from '../../database/transaction-runner';
import { ObjectStorageUnavailableError } from '../../object-storage/object-storage.errors';
import { ApiException, type ApiErrorBody } from './api.exception';

/** The answer of a dependency outage behind a route; the OpenAPI document shows exactly this body. */
export const SERVICE_UNAVAILABLE_ERROR: Readonly<ApiErrorBody> = Object.freeze({
  code: 'SERVICE_UNAVAILABLE',
  message: 'The service is temporarily unavailable. Retry shortly.',
});

/**
 * 503 for a dependency that could not answer: a database (a transaction's TransientDatabaseError, or the driver's
 * own error from a read outside TransactionRunner) or the object storage. Anything else is not an outage (undefined),
 * so a defect is reported as an internal error instead of being hidden behind a retry.
 */
export function toUnavailableApiException(error: unknown): ApiException | undefined {
  if (
    !(error instanceof TransientDatabaseError) &&
    !(error instanceof ObjectStorageUnavailableError) &&
    !toTransientError(error)
  ) {
    return undefined;
  }

  return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, SERVICE_UNAVAILABLE_ERROR);
}
