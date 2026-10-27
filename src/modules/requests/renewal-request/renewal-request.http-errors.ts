import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { FinanceSetupIncompleteError } from '../../organization/organization.errors';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestApplicationRetiredError,
  AccessRequestNoDepartmentError,
  AccessRequestSpendDateNotAllowedError,
} from '../access-request/access-request.errors';
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

const example = (error: Error) => errorExampleOf(toRenewalApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const RENEWAL_ERROR_EXAMPLES = {
  NOT_HOLDER: example(new RenewalRequestRefusedError('NOT_HOLDER')),
  OUTSIDE_DEPARTMENT: example(new RenewalRequestRefusedError('OUTSIDE_DEPARTMENT')),
  ASSIGNMENT_NOT_FOUND: example(new RenewalRequestRefusedError('ASSIGNMENT_NOT_FOUND')),
  ASSIGNMENT_NOT_RENEWABLE: example(new RenewalRequestRefusedError('ASSIGNMENT_NOT_RENEWABLE', 'NOT_OPEN')),
  ALREADY_REQUESTED: example(new RenewalRequestRefusedError('ALREADY_REQUESTED')),
  END_PASSED: example(new RenewalRequestRefusedError('END_PASSED')),
  END_NOT_AFTER: example(new RenewalRequestRefusedError('END_NOT_AFTER')),
  END_TOO_FAR: example(new RenewalRequestRefusedError('END_TOO_FAR')),
  TERM_CONFIRMATION_REQUIRED: example(new RenewalRequestRefusedError('TERM_CONFIRMATION_REQUIRED')),
  APPLICATION_RETIRED: example(new AccessRequestApplicationRetiredError()),
  ALREADY_HOLDS_ACCESS: example(
    new AccessRequestAlreadyHoldsAccessError({
      assignmentId: '<assignment-id>',
      effectiveFrom: '2026-01-01',
      validUntil: null,
    }),
  ),
  NO_DEPARTMENT: example(new AccessRequestNoDepartmentError()),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  NO_SPEND_FOR_FREE_SOFTWARE: example(new AccessRequestSpendDateNotAllowedError()),
} as const;
