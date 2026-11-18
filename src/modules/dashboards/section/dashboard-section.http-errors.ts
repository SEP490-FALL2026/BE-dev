import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { DashboardRefusedError } from './dashboard-section.errors';

/**
 * The answer of an overview route to what its service threw: a refusal is the body the guard gives a wrong role (403
 * `AUTHORIZATION.FORBIDDEN`), a database that does not answer is 503, and anything else goes on to the exception filter.
 */
export function toDashboardApiException(error: unknown): unknown {
  if (error instanceof DashboardRefusedError) return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);

  return toUnavailableApiException(error) ?? error;
}
