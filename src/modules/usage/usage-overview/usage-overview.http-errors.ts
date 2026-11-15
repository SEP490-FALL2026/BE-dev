import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_EXAMPLE } from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { UsageOverviewRefusedError, type UsageOverviewProblem } from './usage-overview.errors';

const STATUS: Record<UsageOverviewProblem, HttpStatus> = {
  RANGE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  EMPLOYEE_NOT_FOUND: HttpStatus.NOT_FOUND,
  APPLICATION_NOT_FOUND: HttpStatus.NOT_FOUND,
};

/** Maps the errors of the usage reads to their HTTP answers; a database that cannot answer is a 503. */
export function toUsageOverviewApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof UsageOverviewRefusedError) {
    return new ApiException(STATUS[error.problem], {
      code: `USAGE_OVERVIEW.${error.problem}`,
      message: error.message,
      ...(error.reason ? { details: { reason: error.reason } } : {}),
    });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (problem: UsageOverviewProblem, reason?: UsageOverviewRefusedError['reason']) =>
  errorExampleOf(toUsageOverviewApiException(new UsageOverviewRefusedError(problem, reason)));

export const USAGE_OVERVIEW_ERROR_EXAMPLES = {
  RANGE_INVALID: example('RANGE_INVALID', 'RANGE_TOO_LONG'),
  EMPLOYEE_NOT_FOUND: example('EMPLOYEE_NOT_FOUND'),
  APPLICATION_NOT_FOUND: example('APPLICATION_NOT_FOUND'),
} as const;

/** The answer of a read of the usage to anyone but an IT Admin: a head of department or Finance never reads it (`QĐ-101i`). */
export const FORBIDDEN_USAGE_READ = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only an IT Admin reads the usage of the people of the departments they work: a head of department never does.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
