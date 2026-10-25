import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { RenewalRequestRefusedError, type RenewalRefusal } from './renewal-request.errors';

const STATUS: Record<RenewalRefusal, HttpStatus> = {
  NOT_HOLDER: HttpStatus.FORBIDDEN,
  OUTSIDE_DEPARTMENT: HttpStatus.FORBIDDEN,
  ASSIGNMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  ASSIGNMENT_NOT_RENEWABLE: HttpStatus.CONFLICT,
  ALREADY_REQUESTED: HttpStatus.CONFLICT,
  END_PASSED: HttpStatus.CONFLICT,
  END_NOT_AFTER: HttpStatus.UNPROCESSABLE_ENTITY,
  END_TOO_FAR: HttpStatus.UNPROCESSABLE_ENTITY,
  TERM_CONFIRMATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Maps the errors of the route of renewals to their HTTP answers and leaves the rest to the request mapper. */
export function toRenewalApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof RenewalRequestRefusedError) {
    return new ApiException(STATUS[error.reason], {
      code: `RENEWAL_REQUEST.${error.reason}`,
      message: error.message,
      ...(error.problem ? { details: { reason: error.problem } } : {}),
    });
  }

  return toAccessRequestApiException(error);
}
