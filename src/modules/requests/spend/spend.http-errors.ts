import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import {
  BudgetInformationNotFoundError,
  BudgetInformationRefusedError,
  SpendBatchNotFoundError,
  SpendDecisionRefusedError,
  SpendNotFinanceError,
  SpendNotHeadError,
  SpendNotInQueueError,
  SpendReviewNotFoundError,
  SpendReviewNotOpenError,
  SpendReviewRefusedError,
  SpendSupplementRefusedError,
} from './spend.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the check and the review of Finance to their HTTP answers; the rest are the request's own. */
export function toSpendApiException(error: unknown): unknown {
  if (error instanceof SpendReviewNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SPEND.REVIEW_NOT_FOUND', error.message);
  }
  if (error instanceof SpendNotFinanceError) return refuse(HttpStatus.FORBIDDEN, 'SPEND.NOT_FINANCE', error.message);
  if (error instanceof SpendReviewNotOpenError) {
    return refuse(HttpStatus.CONFLICT, 'SPEND.REVIEW_NOT_OPEN', error.message);
  }
  if (error instanceof SpendReviewRefusedError) {
    return refuse(HttpStatus.CONFLICT, `SPEND.${error.reason}`, error.message);
  }

  if (error instanceof SpendNotHeadError) return refuse(HttpStatus.FORBIDDEN, 'SPEND.NOT_HEAD', error.message);
  if (error instanceof SpendNotInQueueError) return refuse(HttpStatus.CONFLICT, 'SPEND.NOT_IN_QUEUE', error.message);
  if (error instanceof SpendBatchNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SPEND.BATCH_NOT_FOUND', error.message);
  }
  if (error instanceof SpendDecisionRefusedError) {
    const forbidden = error.reason === 'NOT_THE_ASSIGNEE' || error.reason === 'OWN_REQUEST';
    const invalid = error.reason.startsWith('OVERRIDE_');
    const status = forbidden ? HttpStatus.FORBIDDEN : invalid ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.CONFLICT;

    return new ApiException(status, {
      code: `SPEND.${error.reason}`,
      message: error.message,
      ...(error.years.length > 0 ? { details: { years: [...error.years] } } : {}),
    });
  }
  if (error instanceof BudgetInformationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET_INFORMATION.NOT_FOUND', error.message);
  }
  if (error instanceof BudgetInformationRefusedError) {
    const forbidden = ['NOT_THE_ASSIGNEE', 'OWN_REQUEST', 'NOT_FINANCE', 'SOD_APPROVER'].includes(error.reason);

    return refuse(
      forbidden ? HttpStatus.FORBIDDEN : HttpStatus.CONFLICT,
      `BUDGET_INFORMATION.${error.reason}`,
      error.message,
    );
  }
  if (error instanceof SpendSupplementRefusedError) {
    return refuse(HttpStatus.CONFLICT, `SPEND.SUPPLEMENT_${error.reason}`, error.message);
  }

  return toAccessRequestApiException(error);
}
