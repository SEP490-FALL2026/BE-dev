import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { CongestionHolderNotFoundError } from './congestion.errors';

/**
 * Maps the errors of the board of the Super Admin to their HTTP answers; a database that cannot answer is a 503, the rest
 * goes to the global filter.
 */
export function toCongestionApiException(error: unknown): unknown {
  if (error instanceof CongestionHolderNotFoundError) {
    return new ApiException(HttpStatus.NOT_FOUND, { code: 'STEP_CONGESTION.HOLDER_NOT_FOUND', message: error.message });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toCongestionApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const CONGESTION_ERROR_EXAMPLES = {
  HOLDER_NOT_FOUND: example(new CongestionHolderNotFoundError()),
} as const;
