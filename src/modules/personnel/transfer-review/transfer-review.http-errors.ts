import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { TransferReviewError, type TransferReviewProblem } from './transfer-review.errors';

const ANSWERS: Readonly<Record<TransferReviewProblem, { status: HttpStatus; message: string }>> = {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'The transfer review does not exist.' },
  NOT_REVIEWER: {
    status: HttpStatus.FORBIDDEN,
    message: 'Only the head of the department the person came to decides about the tools.',
  },
  ITEM_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'The tool is not part of this review.' },
  DECISION_ALREADY_RECORDED: {
    status: HttpStatus.CONFLICT,
    message: 'A decision about this tool was written already and does not change.',
  },
  NOT_OPEN: { status: HttpStatus.CONFLICT, message: 'The review is not open: it was completed or replaced.' },
  EMPLOYEE_LEFT: {
    status: HttpStatus.CONFLICT,
    message: 'The person has left; their seats follow the leaving of the person.',
  },
  REVOCATION_NOT_SUPPORTED: {
    status: HttpStatus.CONFLICT,
    message: 'This kind of tool cannot be taken away through the system yet; the decision was not written.',
  },
  SEAT_NOT_OPEN: {
    status: HttpStatus.CONFLICT,
    message: 'The seat has ended or is set to end; there is nothing left to take away.',
  },
};

/** Maps the refusals of the transfer review routes to their codes; anything else goes to the global filter unchanged. */
export function toTransferReviewApiException(error: unknown): unknown {
  if (!(error instanceof TransferReviewError)) return error;
  const answer = ANSWERS[error.problem];

  return new ApiException(answer.status, {
    code: `TRANSFER_REVIEW.${error.problem}`,
    message: answer.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}
