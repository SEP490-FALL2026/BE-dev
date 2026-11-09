import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { UsageIdentityRefusedError, type UsageIdentityProblem } from './identity.errors';

const STATUS: Record<UsageIdentityProblem, HttpStatus> = {
  UNMATCHED_NOT_FOUND: HttpStatus.NOT_FOUND,
  MAPPING_NOT_FOUND: HttpStatus.NOT_FOUND,
  EMPLOYEE_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  ALREADY_MAPPED: HttpStatus.CONFLICT,
  ALREADY_HANDLED: HttpStatus.CONFLICT,
  MAPPING_ENDED: HttpStatus.CONFLICT,
};

/** Maps the errors of the identity routes to their HTTP answers; a database that cannot answer is a 503. */
export function toUsageIdentityApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof UsageIdentityRefusedError) {
    return new ApiException(STATUS[error.problem], { code: `USAGE_IDENTITY.${error.problem}`, message: error.message });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (problem: UsageIdentityProblem) =>
  errorExampleOf(toUsageIdentityApiException(new UsageIdentityRefusedError(problem)));

export const USAGE_IDENTITY_ERROR_EXAMPLES = {
  UNMATCHED_NOT_FOUND: example('UNMATCHED_NOT_FOUND'),
  MAPPING_NOT_FOUND: example('MAPPING_NOT_FOUND'),
  EMPLOYEE_NOT_FOUND: example('EMPLOYEE_NOT_FOUND'),
  ALREADY_MAPPED: example('ALREADY_MAPPED'),
  ALREADY_HANDLED: example('ALREADY_HANDLED'),
  MAPPING_ENDED: example('MAPPING_ENDED'),
} as const;
