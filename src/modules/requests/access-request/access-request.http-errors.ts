import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import {
  RequestPartyIneligibleError,
  requestPartyRefusalBody,
} from '../../identity-access/public/request-party.errors';
import { EmployeeNotStartedError, FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { termRuleOf } from '../../../core/term-limit';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestOpenLimitReachedError,
  AccessRequestOpenRequestExistsError,
  AccessRequestEmployeeRequiredError,
  AccessRequestNotDraftError,
  AccessRequestRoleRequiredError,
  AccessRequestSuperAdminCannotRequestError,
  AccessRequestTermRefusedError,
  AccessRequestGroupUsesLinesError,
  AccessRequestApplicationRetiredError,
  AccessRequestDecisionRefusedError,
  AccessRequestNotAssigneeError,
  AccessRequestCancellationRefusedError,
  AccessRequestWithdrawalRefusedError,
  AccessRequestNoDepartmentError,
  AccessRequestNotFoundError,
  AccessRequestNotRequesterError,
  AccessRequestNotAwaitingRevisionError,
  AccessRequestNotPriceableError,
  AccessRequestPlanBoundToDeviceError,
  AccessRequestPlanNotFoundError,
} from './access-request.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** What the client needs to act on a refused time of use: the contract end, or the most months the kind of plan takes. */
function termDetailsOf(error: AccessRequestTermRefusedError): { details?: Record<string, unknown> } {
  if (error.reason === 'TERM_CONTRACT_ENDED' || error.reason === 'K1_ANNUAL_CONTRACT_TOO_SHORT') {
    return { details: { contractEndDate: error.contractEndDate } };
  }
  if (error.reason !== 'TERM_MONTHS_OUT_OF_RANGE') return {};
  const { maxMonths } = termRuleOf(error.kind ?? 'K2');

  return { details: { maxMonths, ...(error.kind === null ? {} : { provisioningType: error.kind }) } };
}

/** Maps the errors of the request routes to their HTTP answers; a database that cannot answer is a 503. */
export function toAccessRequestApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof AccessRequestNotRequesterError)
    return refuse(HttpStatus.FORBIDDEN, 'ACCESS_REQUEST.NOT_REQUESTER', error.message);
  if (error instanceof AccessRequestNotAwaitingRevisionError)
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.NOT_AWAITING_REVISION', error.message);

  if (error instanceof AccessRequestNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'ACCESS_REQUEST.NOT_FOUND', error.message);
  }
  if (error instanceof AccessRequestPlanNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'ACCESS_REQUEST.PLAN_NOT_FOUND', error.message);
  }
  if (error instanceof AccessRequestApplicationRetiredError) {
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.APPLICATION_RETIRED', error.message);
  }
  if (error instanceof AccessRequestPlanBoundToDeviceError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE', error.message);
  }
  if (error instanceof AccessRequestNoDepartmentError) {
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.NO_DEPARTMENT', error.message);
  }
  if (error instanceof EmployeeNotStartedError) {
    return refuse(HttpStatus.CONFLICT, 'EMPLOYEE.NOT_STARTED', error.message);
  }
  // The department has no Cost Center in use yet (`QĐ-87d(1)`): Finance creates it first. Nothing was written.
  if (error instanceof FinanceSetupIncompleteError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'FINANCE.SETUP_INCOMPLETE',
      message: error.message,
      details: { departmentId: error.departmentId },
    });
  }

  // The spending approver, whatever the route, is no party of a Request (`D-S21`): one code, one body.
  if (error instanceof RequestPartyIneligibleError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, requestPartyRefusalBody(error));
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

  if (error instanceof AccessRequestTermRefusedError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: `ACCESS_REQUEST.${error.reason}`,
      message: error.message,
      ...termDetailsOf(error),
    });
  }
  if (error instanceof AccessRequestAlreadyHoldsAccessError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'ACCESS_REQUEST.ALREADY_HOLDS_ACCESS',
      message: error.message,
      details: { assignment: error.held },
    });
  }
  if (error instanceof AccessRequestOpenRequestExistsError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'ACCESS_REQUEST.OPEN_REQUEST_EXISTS',
      message: error.message,
      details: { requestId: error.requestId },
    });
  }
  if (error instanceof AccessRequestOpenLimitReachedError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'ACCESS_REQUEST.OPEN_LIMIT_REACHED',
      message: error.message,
      details: { limit: error.limit, resetsOn: error.resetsOn },
    });
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

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const ACCESS_REQUEST_ERROR_EXAMPLES = {
  NOT_AWAITING_REVISION: example(new AccessRequestNotAwaitingRevisionError()),
  NOT_FOUND: example(new AccessRequestNotFoundError()),
  PLAN_NOT_FOUND: example(new AccessRequestPlanNotFoundError()),
  PLAN_BOUND_TO_DEVICE: example(new AccessRequestPlanBoundToDeviceError()),
  APPLICATION_RETIRED: example(new AccessRequestApplicationRetiredError()),
  TERM_REQUIRED: example(new AccessRequestTermRefusedError('TERM_REQUIRED')),
  TERM_MONTHS_OUT_OF_RANGE: example(new AccessRequestTermRefusedError('TERM_MONTHS_OUT_OF_RANGE', null, 'K1')),
  TERM_NOT_ASKED: example(new AccessRequestTermRefusedError('TERM_NOT_ASKED')),
  TERM_LONG_TERM_NOT_ALLOWED: example(new AccessRequestTermRefusedError('TERM_LONG_TERM_NOT_ALLOWED')),
  TERM_CONTRACT_ENDED: example(new AccessRequestTermRefusedError('TERM_CONTRACT_ENDED', '2026-10-31')),
  K1_ANNUAL_TERM_FIXED: example(new AccessRequestTermRefusedError('K1_ANNUAL_TERM_FIXED', null, 'K1')),
  K1_ANNUAL_CONTRACT_TOO_SHORT: example(
    new AccessRequestTermRefusedError('K1_ANNUAL_CONTRACT_TOO_SHORT', '2027-03-31', 'K1'),
  ),
  NO_DEPARTMENT: example(new AccessRequestNoDepartmentError()),
  EMPLOYEE_NOT_STARTED: example(new EmployeeNotStartedError()),
  REQUEST_PARTY_INELIGIBLE: example(
    new RequestPartyIneligibleError({
      reason: 'SPENDING_APPROVER',
      party: 'REQUESTER',
      employeeIds: ['<employee-id>'],
    }),
  ),
  /** What the preview answers: it refuses only an employee who is placed in no department; a spending approver gets 200 with `blockedBy`. */
  PREVIEW_REQUEST_PARTY_UNPLACED: example(
    new RequestPartyIneligibleError({ reason: 'UNPLACED', party: 'REQUESTER', employeeIds: ['<employee-id>'] }),
  ),
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
  OPEN_REQUEST_EXISTS: example(new AccessRequestOpenRequestExistsError('<request-id>')),
  OPEN_LIMIT_REACHED: example(new AccessRequestOpenLimitReachedError(10, '2026-11-16')),
  NOT_ASSIGNEE: example(new AccessRequestNotAssigneeError()),
  EMPLOYEE_REQUIRED: example(new AccessRequestEmployeeRequiredError()),
  GROUP_USES_LINES: example(new AccessRequestGroupUsesLinesError()),
  DECISION_OWN_REQUEST: decision('OWN_REQUEST'),
  DECISION_NOT_THE_ASSIGNEE: decision('NOT_THE_ASSIGNEE'),
  STEP_NOT_PENDING: decision('STEP_NOT_PENDING'),
  NOT_REQUESTER: withdrawal('NOT_REQUESTER'),
  WITHDRAWAL_REASON_REQUIRED: withdrawal('REASON_REQUIRED'),
  WITHDRAWAL_ALREADY_ENDED: withdrawal('ALREADY_ENDED'),
  WITHDRAWAL_PENDING: withdrawal('WITHDRAWAL_PENDING'),
  GRANT_RUNNING: withdrawal('GRANT_RUNNING'),
  WITHDRAWAL_AFTER_DECISION: example(
    new AccessRequestWithdrawalRefusedError('WITHDRAWAL_AFTER_DECISION', {
      scope: 'REQUEST',
      state: 'AWAITING_SPEND_DECISION',
    }),
  ),
  GRANT_COMPLETED: example(
    new AccessRequestWithdrawalRefusedError('GRANT_COMPLETED', { assignmentId: '<assignment-id>' }),
  ),
  CANCELLATION_ALREADY_ENDED: cancellation('ALREADY_ENDED'),
  CANCELLATION_WITHDRAWAL_PENDING: cancellation('WITHDRAWAL_PENDING'),
  GROUP_REQUEST_UNSUPPORTED: cancellation('GROUP_REQUEST_UNSUPPORTED'),
  BENEFICIARY_NOT_LEFT: cancellation('BENEFICIARY_NOT_LEFT'),
  BENEFICIARY_NOT_TRANSFERRED: cancellation('BENEFICIARY_NOT_TRANSFERRED'),
  EVIDENCE_REQUIRED: cancellation('EVIDENCE_REQUIRED'),
} as const;

/** The refused-term error examples for the routes that judge a request term (`QĐ-111i`, `INV-07`, `W3-17`). */
export const TERM_ERROR_EXAMPLES = [
  ACCESS_REQUEST_ERROR_EXAMPLES.TERM_REQUIRED,
  ACCESS_REQUEST_ERROR_EXAMPLES.TERM_MONTHS_OUT_OF_RANGE,
  ACCESS_REQUEST_ERROR_EXAMPLES.TERM_NOT_ASKED,
  ACCESS_REQUEST_ERROR_EXAMPLES.TERM_LONG_TERM_NOT_ALLOWED,
  ACCESS_REQUEST_ERROR_EXAMPLES.TERM_CONTRACT_ENDED,
  ACCESS_REQUEST_ERROR_EXAMPLES.K1_ANNUAL_TERM_FIXED,
  ACCESS_REQUEST_ERROR_EXAMPLES.K1_ANNUAL_CONTRACT_TOO_SHORT,
] as const;
