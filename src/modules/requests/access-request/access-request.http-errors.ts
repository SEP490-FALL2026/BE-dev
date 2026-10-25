import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestEmployeeRequiredError,
  AccessRequestGroupUsesLinesError,
  DelegatedRequestRefusedError,
  AccessRequestApplicationRetiredError,
  AccessRequestDecisionRefusedError,
  AccessRequestNotAssigneeError,
  AccessRequestSpendDateNotAllowedError,
  AccessRequestCancellationRefusedError,
  AccessRequestWithdrawalRefusedError,
  AccessRequestNoDepartmentError,
  AccessRequestNotFoundError,
  AccessRequestNotPriceableError,
  AccessRequestOutsideStandardReasonRequiredError,
  AccessRequestPlanLineRefusedError,
  AccessRequestPlanNotFoundError,
} from './access-request.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the request routes to their HTTP answers; a database that cannot answer is a 503. */
export function toAccessRequestApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof AccessRequestNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'ACCESS_REQUEST.NOT_FOUND', error.message);
  }
  if (error instanceof AccessRequestPlanNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'ACCESS_REQUEST.PLAN_NOT_FOUND', error.message);
  }
  if (error instanceof AccessRequestApplicationRetiredError) {
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.APPLICATION_RETIRED', error.message);
  }
  if (error instanceof AccessRequestNoDepartmentError) {
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.NO_DEPARTMENT', error.message);
  }

  if (error instanceof DelegatedRequestRefusedError) {
    const status =
      error.reason === 'NOT_HEAD'
        ? HttpStatus.FORBIDDEN
        : error.reason === 'BENEFICIARY_NOT_ACTIVE'
          ? HttpStatus.CONFLICT
          : HttpStatus.UNPROCESSABLE_ENTITY;

    return new ApiException(status, {
      code: `DELEGATED_REQUEST.${error.reason}`,
      message: error.message,
      ...(error.employeeId === null ? {} : { details: { employeeId: error.employeeId } }),
    });
  }
  if (error instanceof AccessRequestAlreadyHoldsAccessError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'ACCESS_REQUEST.ALREADY_HOLDS_ACCESS',
      message: error.message,
      details: { assignment: error.held },
    });
  }
  if (error instanceof AccessRequestOutsideStandardReasonRequiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCESS_REQUEST.OUTSIDE_STANDARD_REASON_REQUIRED', error.message);
  }
  if (error instanceof AccessRequestSpendDateNotAllowedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCESS_REQUEST.NO_SPEND_FOR_FREE_SOFTWARE', error.message);
  }
  if (error instanceof AccessRequestNotAssigneeError) {
    return refuse(HttpStatus.FORBIDDEN, 'ACCESS_REQUEST.NOT_THE_ASSIGNEE', error.message);
  }
  if (error instanceof AccessRequestDecisionRefusedError) {
    const status =
      error.reason === 'STEP_NOT_PENDING'
        ? HttpStatus.CONFLICT
        : error.reason === 'OWN_REQUEST' || error.reason === 'NOT_THE_ASSIGNEE'
          ? HttpStatus.FORBIDDEN
          : HttpStatus.UNPROCESSABLE_ENTITY;

    return refuse(status, `ACCESS_REQUEST.${error.reason}`, error.message);
  }
  if (error instanceof AccessRequestWithdrawalRefusedError) {
    const status =
      error.reason === 'NOT_REQUESTER'
        ? HttpStatus.FORBIDDEN
        : error.reason === 'REASON_REQUIRED'
          ? HttpStatus.UNPROCESSABLE_ENTITY
          : HttpStatus.CONFLICT;

    return new ApiException(status, {
      code: `ACCESS_REQUEST.${error.reason}`,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  if (error instanceof AccessRequestCancellationRefusedError) {
    return refuse(
      error.reason === 'EVIDENCE_REQUIRED' ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.CONFLICT,
      `ACCESS_REQUEST.${error.reason}`,
      error.message,
    );
  }
  if (error instanceof AccessRequestGroupUsesLinesError) {
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.GROUP_USES_LINES', error.message);
  }
  if (error instanceof AccessRequestEmployeeRequiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCESS_REQUEST.EMPLOYEE_REQUIRED', error.message);
  }
  if (error instanceof AccessRequestPlanLineRefusedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `ACCESS_REQUEST.${error.reason}`, error.message);
  }
  if (error instanceof AccessRequestNotPriceableError) {
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.NOT_PRICEABLE', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}
