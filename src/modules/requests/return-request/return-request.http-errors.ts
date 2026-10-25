import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { ReturnRequestRefusedError, type ReturnRefusal } from './return-request.errors';

const STATUS: Record<ReturnRefusal, HttpStatus> = {
  NOT_HOLDER: HttpStatus.FORBIDDEN,
  OUTSIDE_DEPARTMENT: HttpStatus.FORBIDDEN,
  NOT_REQUESTER: HttpStatus.FORBIDDEN,
  ASSIGNMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_DEPARTMENT: HttpStatus.CONFLICT,
  ASSIGNMENT_NOT_RETURNABLE: HttpStatus.CONFLICT,
  ALREADY_REQUESTED: HttpStatus.CONFLICT,
  RENEWAL_PENDING: HttpStatus.CONFLICT,
  HANDOVER_NOT_REQUIRED: HttpStatus.CONFLICT,
  HANDOVER_ALREADY_CONFIRMED: HttpStatus.CONFLICT,
  NOT_AWAITING: HttpStatus.CONFLICT,
  ORIGIN_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Maps the errors of the routes of returns to their HTTP answers and leaves the rest to the request mapper. */
export function toReturnApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof ReturnRequestRefusedError) {
    return new ApiException(STATUS[error.reason], {
      code: `RETURN_REQUEST.${error.reason}`,
      message: error.message,
      ...(error.problem ? { details: { reason: error.problem } } : {}),
    });
  }

  return toAccessRequestApiException(error);
}
