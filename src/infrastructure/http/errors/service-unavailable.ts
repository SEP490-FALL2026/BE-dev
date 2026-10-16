import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError, toTransientError } from '../../database/transaction-runner';
import { ApiException } from './api.exception';

/**
 * 503 for a database that could not answer: a transaction's TransientDatabaseError, or the driver's
 * own error from a read outside TransactionRunner. Anything else is not an outage (undefined), so a
 * defect is reported as an internal error instead of being hidden behind a retry.
 */
export function toUnavailableApiException(error: unknown): ApiException | undefined {
  if (!(error instanceof TransientDatabaseError) && !toTransientError(error)) return undefined;

  return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, {
    code: 'SERVICE_UNAVAILABLE',
    message: 'The service is temporarily unavailable. Retry shortly.',
  });
}
