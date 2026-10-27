import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  AssignmentEffectiveDateInvalidError,
  AssignmentExpectedEndRequiredError,
  AssignmentNotFoundError,
  AssignmentNotOpenError,
  AssignmentNotServiceAccountError,
  AssignmentResponsibleInvalidError,
} from '../licensing.errors';
import { toLicensingApiException } from '../mappers/licensing.http-errors';
import { AssignmentResponsibleAfterDeadlineError, ServiceAccountDutyTooManyError } from './service-account.errors';

/**
 * Maps the refusals of the routes of service accounts to their codes (`SERVICE_ACCOUNT_DUTY.*` and the deadline of a change of the
 * person responsible); the rest goes to the licensing mapper.
 */
export function toServiceAccountApiException(error: unknown): unknown {
  if (error instanceof AssignmentResponsibleAfterDeadlineError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'LICENSE_ASSIGNMENT.RESPONSIBLE_AFTER_DEADLINE',
      message: 'The change has to take effect no later than the day the transfer or the departure takes effect.',
      details: { dueOn: error.dueOn },
    });
  }
  if (error instanceof ServiceAccountDutyTooManyError) {
    return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, {
      code: 'SERVICE_ACCOUNT_DUTY.TOO_MANY',
      message: 'Too many people have a transfer or a departure that waits to list the service accounts at once.',
    });
  }

  return toLicensingApiException(error);
}

const example = (error: Error) => errorExampleOf(toServiceAccountApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const SERVICE_ACCOUNT_ERROR_EXAMPLES = {
  ASSIGNMENT_NOT_FOUND: example(new AssignmentNotFoundError()),
  ASSIGNMENT_NOT_OPEN: example(new AssignmentNotOpenError()),
  NOT_SERVICE_ACCOUNT: example(new AssignmentNotServiceAccountError()),
  RESPONSIBLE_INVALID: example(new AssignmentResponsibleInvalidError('NOT_ACTIVE')),
  EFFECTIVE_DATE_INVALID: example(new AssignmentEffectiveDateInvalidError('IN_THE_PAST')),
  EXPECTED_END_REQUIRED: example(new AssignmentExpectedEndRequiredError()),
  RESPONSIBLE_AFTER_DEADLINE: example(new AssignmentResponsibleAfterDeadlineError('2026-01-01')),
  DUTY_TOO_MANY: example(new ServiceAccountDutyTooManyError()),
} as const;
