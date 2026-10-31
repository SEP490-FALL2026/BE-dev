import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../infrastructure/http/openapi-error-examples';
import {
  AssignmentConflictError,
  AssignmentEffectiveDateInvalidError,
  AssignmentExpectedEndRequiredError,
  AssignmentNotFoundError,
  AssignmentNotOpenError,
  AssignmentNotServiceAccountError,
  AssignmentResponsibleInvalidError,
  SeatBaselineClosedError,
  SeatApplicationRetiredError,
  SeatSubscriptionDraftError,
  SeatTargetNotFoundError,
  ToolsDepartmentNotFoundError,
  ToolsDepartmentOutOfScopeError,
} from './public/licensing.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

/** Maps the errors of the licensing routes to their HTTP answers; a database that cannot answer is a 503. */
export function toLicensingApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof SeatBaselineClosedError)
    return refuse(HttpStatus.CONFLICT, 'SEAT_BASELINE.CLOSED', error.message);
  if (error instanceof SeatApplicationRetiredError) {
    return refuse(HttpStatus.CONFLICT, 'SEAT_TARGET.APPLICATION_RETIRED', error.message);
  }
  if (error instanceof SeatSubscriptionDraftError) {
    return refuse(UNPROCESSABLE, 'SEAT_TARGET.SUBSCRIPTION_DRAFT', error.message, { missing: error.missing });
  }
  if (error instanceof SeatTargetNotFoundError) {
    return refuse(
      HttpStatus.NOT_FOUND,
      error.target === 'PLAN' ? 'PLAN.NOT_FOUND' : 'SUBSCRIPTION.NOT_FOUND',
      error.message,
    );
  }
  if (error instanceof ToolsDepartmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND', error.message);
  }
  if (error instanceof ToolsDepartmentOutOfScopeError) {
    return refuse(HttpStatus.FORBIDDEN, 'DEPARTMENT.OUT_OF_SCOPE', error.message);
  }
  if (error instanceof AssignmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'LICENSE_ASSIGNMENT.NOT_FOUND', error.message);
  }
  if (error instanceof AssignmentNotOpenError)
    return refuse(HttpStatus.CONFLICT, 'LICENSE_ASSIGNMENT.NOT_OPEN', error.message);
  if (error instanceof AssignmentNotServiceAccountError) {
    return refuse(UNPROCESSABLE, 'LICENSE_ASSIGNMENT.NOT_SERVICE_ACCOUNT', error.message);
  }
  if (error instanceof AssignmentResponsibleInvalidError) {
    return refuse(UNPROCESSABLE, 'LICENSE_ASSIGNMENT.RESPONSIBLE_INVALID', error.message, { problem: error.problem });
  }
  if (error instanceof AssignmentEffectiveDateInvalidError) {
    return refuse(UNPROCESSABLE, 'LICENSE_ASSIGNMENT.EFFECTIVE_DATE_INVALID', error.message, {
      problem: error.problem,
    });
  }
  if (error instanceof AssignmentExpectedEndRequiredError) {
    return refuse(UNPROCESSABLE, 'LICENSE_ASSIGNMENT.EXPECTED_END_REQUIRED', error.message);
  }
  if (error instanceof AssignmentConflictError) {
    if (error.conflict === 'SEAT_CAPACITY')
      return refuse(HttpStatus.CONFLICT, 'LICENSE_ASSIGNMENT.SEAT_CAPACITY', error.message);
    if (error.conflict === 'EXPECTED_END_REQUIRED') {
      return refuse(UNPROCESSABLE, 'LICENSE_ASSIGNMENT.EXPECTED_END_REQUIRED', error.message);
    }
    if (error.conflict === 'SUBSCRIPTION_DEPARTMENT_MISMATCH') {
      return refuse(UNPROCESSABLE, 'LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH', error.message);
    }

    return refuse(
      UNPROCESSABLE,
      error.conflict === 'IDENTIFIER_IN_USE' ? 'LICENSE_ASSIGNMENT.IDENTIFIER_IN_USE' : 'LICENSE_ASSIGNMENT.OVERLAP',
      error.message,
    );
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toLicensingApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const LICENSING_ERROR_EXAMPLES = {
  SUBSCRIPTION_NOT_FOUND: example(new SeatTargetNotFoundError('SUBSCRIPTION')),
  DEPARTMENT_NOT_FOUND: example(new ToolsDepartmentNotFoundError()),
  DEPARTMENT_OUT_OF_SCOPE: example(new ToolsDepartmentOutOfScopeError()),
} as const;
