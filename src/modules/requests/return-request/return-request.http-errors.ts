import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { RequestPartyIneligibleError } from '../../identity-access/public/request-party.errors';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { ReturnRequestRefusedError, type ReturnRefusal } from './return-request.errors';

const STATUS: Record<ReturnRefusal, HttpStatus> = {
  NOT_HOLDER: HttpStatus.FORBIDDEN,
  OUTSIDE_DEPARTMENT: HttpStatus.FORBIDDEN,
  ASSIGNMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_DEPARTMENT: HttpStatus.CONFLICT,
  ASSIGNMENT_NOT_RETURNABLE: HttpStatus.CONFLICT,
  ALREADY_REQUESTED: HttpStatus.CONFLICT,
  RENEWAL_PENDING: HttpStatus.CONFLICT,
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

const example = (error: Error) => errorExampleOf(toReturnApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const RETURN_ERROR_EXAMPLES = {
  NOT_HOLDER: example(new ReturnRequestRefusedError('NOT_HOLDER')),
  OUTSIDE_DEPARTMENT: example(new ReturnRequestRefusedError('OUTSIDE_DEPARTMENT')),
  ASSIGNMENT_NOT_FOUND: example(new ReturnRequestRefusedError('ASSIGNMENT_NOT_FOUND')),
  NOT_FOUND: example(new ReturnRequestRefusedError('NOT_FOUND')),
  NO_DEPARTMENT: example(new ReturnRequestRefusedError('NO_DEPARTMENT')),
  REQUEST_PARTY_INELIGIBLE: example(
    new RequestPartyIneligibleError({
      reason: 'SPENDING_APPROVER',
      party: 'BENEFICIARY',
      employeeIds: ['<employee-id>'],
    }),
  ),
  ASSIGNMENT_NOT_RETURNABLE: example(new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', 'NOT_OPEN')),
  ALREADY_REQUESTED: example(new ReturnRequestRefusedError('ALREADY_REQUESTED')),
  RENEWAL_PENDING: example(new ReturnRequestRefusedError('RENEWAL_PENDING')),
  ORIGIN_MISMATCH: example(new ReturnRequestRefusedError('ORIGIN_MISMATCH')),
} as const;
