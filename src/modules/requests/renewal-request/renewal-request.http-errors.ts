import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestApplicationRetiredError,
  AccessRequestOpenLimitReachedError,
  AccessRequestOpenRequestExistsError,
  AccessRequestNoDepartmentError,
  AccessRequestSuperAdminCannotRequestError,
} from '../access-request/access-request.errors';
import { RequestPartyIneligibleError } from '../../identity-access/public/request-party.errors';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { RenewalRequestRefusedError, RenewalWindowNotOpenError, type RenewalRefusal } from './renewal-request.errors';

const STATUS: Record<RenewalRefusal, HttpStatus> = {
  NOT_HOLDER: HttpStatus.FORBIDDEN,
  ASSIGNMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  ASSIGNMENT_NOT_RENEWABLE: HttpStatus.CONFLICT,
  ALREADY_REQUESTED: HttpStatus.CONFLICT,
};

/** The reason a seat cannot be renewed, or the request that already waits (nothing when the error knows neither). */
function refusalDetailsOf(error: RenewalRequestRefusedError): { details?: Record<string, unknown> } {
  const details = {
    ...(error.problem ? { reason: error.problem } : {}),
    ...(error.blockingRequestId ? { requestId: error.blockingRequestId } : {}),
  };

  return Object.keys(details).length > 0 ? { details } : {};
}

/** Maps the errors of the route of renewals to their HTTP answers and leaves the rest to the request mapper. */
export function toRenewalApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof RenewalRequestRefusedError) {
    return new ApiException(STATUS[error.reason], {
      code: `RENEWAL_REQUEST.${error.reason}`,
      message: error.message,
      ...refusalDetailsOf(error),
    });
  }

  if (error instanceof RenewalWindowNotOpenError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'RENEWAL_REQUEST.WINDOW_NOT_OPEN',
      message: error.message,
      details: { opensOn: error.opensOn, windowDays: error.windowDays },
    });
  }
  return toAccessRequestApiException(error);
}

const example = (error: Error) => errorExampleOf(toRenewalApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const RENEWAL_ERROR_EXAMPLES = {
  NOT_HOLDER: example(new RenewalRequestRefusedError('NOT_HOLDER')),
  ASSIGNMENT_NOT_FOUND: example(new RenewalRequestRefusedError('ASSIGNMENT_NOT_FOUND')),
  ASSIGNMENT_NOT_RENEWABLE: example(new RenewalRequestRefusedError('ASSIGNMENT_NOT_RENEWABLE', 'NOT_OPEN')),
  ALREADY_REQUESTED: example(new RenewalRequestRefusedError('ALREADY_REQUESTED', null, '<request-id>')),
  WINDOW_NOT_OPEN: example(new RenewalWindowNotOpenError('2026-12-01', 30)),
  APPLICATION_RETIRED: example(new AccessRequestApplicationRetiredError()),
  ALREADY_HOLDS_ACCESS: example(
    new AccessRequestAlreadyHoldsAccessError({
      assignmentId: '<assignment-id>',
      effectiveFrom: '2026-01-01',
      validUntil: null,
    }),
  ),
  NO_DEPARTMENT: example(new AccessRequestNoDepartmentError()),
  OPEN_REQUEST_EXISTS: example(new AccessRequestOpenRequestExistsError('<request-id>')),
  OPEN_LIMIT_REACHED: example(new AccessRequestOpenLimitReachedError(10, '2026-11-16')),
  REQUEST_PARTY_INELIGIBLE: example(
    new RequestPartyIneligibleError({
      reason: 'SPENDING_APPROVER',
      party: 'BENEFICIARY',
      employeeIds: ['<employee-id>'],
    }),
  ),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  SUPER_ADMIN_CANNOT_REQUEST: example(new AccessRequestSuperAdminCannotRequestError()),
} as const;
