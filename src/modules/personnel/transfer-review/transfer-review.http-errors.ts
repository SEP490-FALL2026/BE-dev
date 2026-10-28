import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
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
    message:
      'A decision about this tool was written already and is final. Only "still needed" can become "no longer needed", and only while the old seat is not being taken back.',
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

/**
 * Maps the refusals of the transfer review routes to their codes; a database that cannot answer is a 503, anything else
 * goes to the global filter unchanged.
 */
export function toTransferReviewApiException(error: unknown): unknown {
  if (!(error instanceof TransferReviewError)) return toUnavailableApiException(error) ?? error;
  const answer = ANSWERS[error.problem];

  return new ApiException(answer.status, {
    code: `TRANSFER_REVIEW.${error.problem}`,
    message: answer.message,
    ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
  });
}

const example = (error: Error) => errorExampleOf(toTransferReviewApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const TRANSFER_REVIEW_ERROR_EXAMPLES = {
  NOT_FOUND: example(new TransferReviewError('NOT_FOUND')),
  NOT_REVIEWER: example(new TransferReviewError('NOT_REVIEWER')),
  ITEM_NOT_FOUND: example(new TransferReviewError('ITEM_NOT_FOUND')),
  DECISION_ALREADY_RECORDED: example(new TransferReviewError('DECISION_ALREADY_RECORDED')),
  NOT_OPEN: example(new TransferReviewError('NOT_OPEN')),
  REVOCATION_NOT_SUPPORTED: example(new TransferReviewError('REVOCATION_NOT_SUPPORTED', { provisioningType: 'K3' })),
  SEAT_NOT_OPEN: example(new TransferReviewError('SEAT_NOT_OPEN')),
} as const;
