import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestEmployeeRequiredError,
  AccessRequestNotDraftError,
  AccessRequestRoleRequiredError,
  AccessRequestSuperAdminCannotRequestError,
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
  // The department has no Cost Center in use yet (`QĐ-87d(1)`): Finance creates it first. Nothing was written.
  if (error instanceof FinanceSetupIncompleteError) {
    return refuse(HttpStatus.CONFLICT, 'FINANCE.SETUP_INCOMPLETE', error.message);
  }

  // The Super Admin does no business work: no request is sent in their name, whatever the route.
  if (error instanceof AccessRequestSuperAdminCannotRequestError) {
    return refuse(HttpStatus.FORBIDDEN, 'ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST', error.message);
  }
  // A draft that was already sent (or is not a draft) is not sent or deleted again.
  if (error instanceof AccessRequestNotDraftError) {
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.NOT_DRAFT', error.message);
  }
  // A service judged the role itself, as the guard of the route does: the same answer.
  if (error instanceof AccessRequestRoleRequiredError) {
    return refuse(
      HttpStatus.FORBIDDEN,
      'AUTHORIZATION.FORBIDDEN',
      'You do not have permission to perform this action.',
    );
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
  if (error instanceof AccessRequestSpendDateNotAllowedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCESS_REQUEST.NO_SPEND_FOR_FREE_SOFTWARE', error.message);
  }
  if (error instanceof AccessRequestNotAssigneeError) {
    return refuse(HttpStatus.FORBIDDEN, 'ACCESS_REQUEST.NOT_THE_ASSIGNEE', error.message);
  }
  if (error instanceof AccessRequestDecisionRefusedError) {
    const status =
      error.reason === 'STEP_NOT_PENDING' || error.reason === 'STEP_AWAITING_CONVERSION'
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
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  SUPER_ADMIN_CANNOT_REQUEST: example(new AccessRequestSuperAdminCannotRequestError()),
  NOT_DRAFT: example(new AccessRequestNotDraftError()),
  ALREADY_HOLDS_ACCESS: example(
    new AccessRequestAlreadyHoldsAccessError({
      assignmentId: '<assignment-id>',
      effectiveFrom: '2026-01-01',
      validUntil: null,
    }),
  ),
  NO_SPEND_FOR_FREE_SOFTWARE: example(new AccessRequestSpendDateNotAllowedError()),
  NOT_ASSIGNEE: example(new AccessRequestNotAssigneeError()),
  EMPLOYEE_REQUIRED: example(new AccessRequestEmployeeRequiredError()),
  GROUP_USES_LINES: example(new AccessRequestGroupUsesLinesError()),
  DECISION_OWN_REQUEST: decision('OWN_REQUEST'),
  DECISION_NOT_THE_ASSIGNEE: decision('NOT_THE_ASSIGNEE'),
  STEP_NOT_PENDING: decision('STEP_NOT_PENDING'),
  STEP_AWAITING_CONVERSION: decision('STEP_AWAITING_CONVERSION'),
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
  BENEFICIARY_NOT_TRANSFERRED: cancellation('BENEFICIARY_NOT_TRANSFERRED'),
  EVIDENCE_REQUIRED: cancellation('EVIDENCE_REQUIRED'),
  NOT_HEAD: delegation('NOT_HEAD'),
  BENEFICIARY_NOT_ACTIVE: delegation('BENEFICIARY_NOT_ACTIVE'),
  OUTSIDE_DEPARTMENT: delegation('OUTSIDE_DEPARTMENT'),
  EMAIL_REQUIRED: delegation('EMAIL_REQUIRED'),
  END_DATE_REQUIRED: delegation('END_DATE_REQUIRED'),
  END_DATE_TOO_EARLY: delegation('END_DATE_TOO_EARLY'),
  DELEGATED_TERM_CONFIRMATION_REQUIRED: delegation('TERM_CONFIRMATION_REQUIRED'),
} as const;
