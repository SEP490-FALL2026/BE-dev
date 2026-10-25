import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toLicensingApiException } from '../mappers/licensing.http-errors';
import {
  AssignmentResponsibleAfterDeadlineError,
  ServiceAccountDutyTooManyError,
  ServiceAccountMoveError,
  type ServiceAccountMoveProblem,
} from './service-account.errors';

const ANSWERS: Readonly<Record<ServiceAccountMoveProblem, { status: HttpStatus; message: string }>> = {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'The move of the service account does not exist.' },
  NOT_CONFIRMER: {
    status: HttpStatus.FORBIDDEN,
    message: 'Only the head of the receiving department confirms the move, or the fallback approver when it has none.',
  },
  NOT_PENDING: { status: HttpStatus.CONFLICT, message: 'The move was confirmed or cancelled already.' },
  MOVE_EFFECTIVE_DATE_PASSED: {
    status: HttpStatus.CONFLICT,
    message: 'The day the move takes effect has passed: propose it again.',
  },
  PENDING_EXISTS: { status: HttpStatus.CONFLICT, message: 'A move of this service account already waits.' },
  TARGET_DEPARTMENT_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The receiving department cannot take the service account.',
  },
  RESPONSIBLE_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The person named cannot answer for the service account in the receiving department.',
  },
  REASON_REQUIRED: { status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'A reason is required.' },
};

/**
 * Maps the refusals of the routes of service accounts to their codes (`SERVICE_ACCOUNT_MOVE.*`, `SERVICE_ACCOUNT_DUTY.*` and the
 * deadline of a change of the person responsible); the rest goes to the licensing mapper.
 */
export function toServiceAccountApiException(error: unknown): unknown {
  if (error instanceof ServiceAccountMoveError) {
    const answer = ANSWERS[error.problem];

    return new ApiException(answer.status, {
      code: `SERVICE_ACCOUNT_MOVE.${error.problem}`,
      message: answer.message,
      ...(error.reason ? { details: { reason: error.reason } } : {}),
    });
  }
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
