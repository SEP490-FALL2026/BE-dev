import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
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

const example = (error: Error) => errorExampleOf(toAccessRequestApiException(error));
const decision = (reason: ConstructorParameters<typeof AccessRequestDecisionRefusedError>[0]) =>
  example(new AccessRequestDecisionRefusedError(reason));
const withdrawal = (reason: ConstructorParameters<typeof AccessRequestWithdrawalRefusedError>[0]) =>
  example(new AccessRequestWithdrawalRefusedError(reason));
const cancellation = (reason: ConstructorParameters<typeof AccessRequestCancellationRefusedError>[0]) =>
  example(new AccessRequestCancellationRefusedError(reason));
const delegation = (reason: ConstructorParameters<typeof DelegatedRequestRefusedError>[0]) =>
  example(new DelegatedRequestRefusedError(reason, '<employee-id>'));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const ACCESS_REQUEST_ERROR_EXAMPLES = {
  NOT_FOUND: example(new AccessRequestNotFoundError()),
  PLAN_NOT_FOUND: example(new AccessRequestPlanNotFoundError()),
  APPLICATION_RETIRED: example(new AccessRequestApplicationRetiredError()),
  NO_DEPARTMENT: example(new AccessRequestNoDepartmentError()),
  ALREADY_HOLDS_ACCESS: example(
    new AccessRequestAlreadyHoldsAccessError({
      assignmentId: '<assignment-id>',
      effectiveFrom: '2026-01-01',
      validUntil: null,
    }),
  ),
  OUTSIDE_STANDARD_REASON_REQUIRED: example(new AccessRequestOutsideStandardReasonRequiredError()),
  NO_SPEND_FOR_FREE_SOFTWARE: example(new AccessRequestSpendDateNotAllowedError()),
  NOT_ASSIGNEE: example(new AccessRequestNotAssigneeError()),
  EMPLOYEE_REQUIRED: example(new AccessRequestEmployeeRequiredError()),
  GROUP_USES_LINES: example(new AccessRequestGroupUsesLinesError()),
  DECISION_OWN_REQUEST: decision('OWN_REQUEST'),
  DECISION_NOT_THE_ASSIGNEE: decision('NOT_THE_ASSIGNEE'),
  STEP_NOT_PENDING: decision('STEP_NOT_PENDING'),
  TERM_CONFIRMATION_REQUIRED: decision('TERM_CONFIRMATION_REQUIRED'),
  PLAN_LINE_REQUIRED: decision('PLAN_LINE_REQUIRED'),
  SPEND_NOT_APPLICABLE: decision('SPEND_NOT_APPLICABLE'),
  LINE_NOT_FOUND: example(new AccessRequestPlanLineRefusedError('LINE_NOT_FOUND')),
  STILL_NEEDED_REQUIRED: example(new AccessRequestPlanLineRefusedError('STILL_NEEDED_REQUIRED')),
  NOT_REQUESTER: withdrawal('NOT_REQUESTER'),
  WITHDRAWAL_REASON_REQUIRED: withdrawal('REASON_REQUIRED'),
  WITHDRAWAL_ALREADY_ENDED: withdrawal('ALREADY_ENDED'),
  WITHDRAWAL_PENDING: withdrawal('WITHDRAWAL_PENDING'),
  GRANT_RUNNING: withdrawal('GRANT_RUNNING'),
  GRANT_COMPLETED: example(
    new AccessRequestWithdrawalRefusedError('GRANT_COMPLETED', { assignmentId: '<assignment-id>' }),
  ),
  CANCELLATION_ALREADY_ENDED: cancellation('ALREADY_ENDED'),
  CANCELLATION_WITHDRAWAL_PENDING: cancellation('WITHDRAWAL_PENDING'),
  GROUP_REQUEST_UNSUPPORTED: cancellation('GROUP_REQUEST_UNSUPPORTED'),
  BENEFICIARY_NOT_LEFT: cancellation('BENEFICIARY_NOT_LEFT'),
  EVIDENCE_REQUIRED: cancellation('EVIDENCE_REQUIRED'),
  NOT_HEAD: delegation('NOT_HEAD'),
  BENEFICIARY_NOT_ACTIVE: delegation('BENEFICIARY_NOT_ACTIVE'),
  OUTSIDE_DEPARTMENT: delegation('OUTSIDE_DEPARTMENT'),
  EMAIL_REQUIRED: delegation('EMAIL_REQUIRED'),
  END_DATE_REQUIRED: delegation('END_DATE_REQUIRED'),
  END_DATE_TOO_EARLY: delegation('END_DATE_TOO_EARLY'),
  DELEGATED_TERM_CONFIRMATION_REQUIRED: delegation('TERM_CONFIRMATION_REQUIRED'),
} as const;
