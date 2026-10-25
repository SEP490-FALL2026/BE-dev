import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toSpendApiException } from '../spend/spend.http-errors';
import {
  GroupRequestDuplicateLineError,
  GroupRequestLineHoldsAccessError,
  GroupRequestLineNotFoundError,
  GroupRequestLinesMismatchError,
  GroupRequestLinesRefusedError,
  GroupRequestPlanNotEligibleError,
  GroupRequestTermConfirmationRequiredError,
  GroupRequestTooManyLinesError,
  GroupSupplementDropRefusedError,
} from './group-request.errors';

/**
 * Maps the errors of the request for a group to their HTTP answers. The rest are those of the request and of the spend decision,
 * which the routes of a group raise as they are (a refusal to decide, a withdrawal that cannot be made).
 */
export function toGroupRequestApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof GroupRequestPlanNotEligibleError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.PLAN_NOT_ELIGIBLE',
      message: error.message,
      details: { reason: error.reason },
    });
  }
  if (error instanceof GroupRequestTooManyLinesError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.TOO_MANY_LINES',
      message: error.message,
      details: { max: error.max },
    });
  }
  if (error instanceof GroupRequestDuplicateLineError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.DUPLICATE_LINE',
      message: error.message,
      details: { employeeIds: [...error.employeeIds] },
    });
  }
  if (error instanceof GroupRequestLinesRefusedError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.LINES_REFUSED',
      message: error.message,
      details: { lines: error.lines.map((line) => ({ employeeId: line.employeeId, reason: line.reason })) },
    });
  }
  if (error instanceof GroupRequestTermConfirmationRequiredError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.TERM_CONFIRMATION_REQUIRED',
      message: error.message,
    });
  }
  if (error instanceof GroupRequestLinesMismatchError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.LINES_MISMATCH',
      message: error.message,
      details: { missing: [...error.mismatch.missing], extra: [...error.mismatch.extra] },
    });
  }
  if (error instanceof GroupRequestLineHoldsAccessError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'GROUP_REQUEST.LINE_HOLDS_ACCESS',
      message: error.message,
      details: { lines: [...error.employeeIds] },
    });
  }
  if (error instanceof GroupRequestLineNotFoundError) {
    return new ApiException(HttpStatus.NOT_FOUND, { code: 'GROUP_REQUEST.LINE_NOT_FOUND', message: error.message });
  }
  if (error instanceof GroupSupplementDropRefusedError) {
    const status = error.reason === 'LINE_NOT_DROPPABLE' ? HttpStatus.CONFLICT : HttpStatus.UNPROCESSABLE_ENTITY;

    return new ApiException(status, {
      code: `SUPPLEMENT.${error.reason}`,
      message: error.message,
      ...(error.employeeIds.length > 0 ? { details: { employeeIds: [...error.employeeIds] } } : {}),
    });
  }

  return toSpendApiException(error);
}
