import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toLicensingApiException } from '../mappers/licensing.http-errors';
import { HandoverDutyError, type HandoverDutyProblem } from './handover.errors';

const ANSWERS: Readonly<Record<HandoverDutyProblem, { status: HttpStatus; message: string }>> = {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'The handover duty does not exist.' },
  SCOPE_FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: 'Only an IT Admin reads the handover duties of everyone.',
  },
  NOT_CONFIRMER: {
    status: HttpStatus.FORBIDDEN,
    message: 'Only the person the handover falls to confirms it.',
  },
  VALUE_NOT_ALLOWED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The value is not one this handover allows.',
  },
  ALREADY_CONFIRMED: { status: HttpStatus.CONFLICT, message: 'The handover was confirmed already.' },
  CANCELLED: { status: HttpStatus.CONFLICT, message: 'The handover was cancelled.' },
};

/** Maps the refusals of the handover routes to their codes; the rest (a database that cannot answer) goes to the licensing mapper. */
export function toHandoverApiException(error: unknown): unknown {
  if (error instanceof HandoverDutyError) {
    const answer = ANSWERS[error.problem];

    return new ApiException(answer.status, {
      code: `HANDOVER_DUTY.${error.problem}`,
      message: answer.message,
    });
  }

  return toLicensingApiException(error);
}
