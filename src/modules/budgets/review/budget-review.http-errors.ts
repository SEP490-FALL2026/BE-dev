import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toBudgetApiException } from '../budget/budget.http-errors';
import {
  BudgetReviewExistsError,
  BudgetReviewLineNotFoundError,
  BudgetReviewMonthNotEndedError,
  BudgetReviewNoBudgetError,
  BudgetReviewNotAskedError,
  BudgetReviewNotAwaitingError,
  BudgetReviewNotFoundError,
  BudgetReviewSeatMonthsError,
  BudgetReviewSignedError,
} from './budget-review.errors';

const refuse = (
  status: HttpStatus,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiException => new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the review routes to their HTTP answers; the others are the budgets' own. */
export function toBudgetReviewApiException(error: unknown): unknown {
  if (error instanceof BudgetReviewNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET_REVIEW.NOT_FOUND', error.message);
  }
  if (error instanceof BudgetReviewMonthNotEndedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_REVIEW.MONTH_NOT_ENDED', error.message, {
      year: error.year,
      month: error.month,
    });
  }
  if (error instanceof BudgetReviewNoBudgetError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_REVIEW.NO_BUDGET_FOR_YEAR', error.message, {
      year: error.year,
    });
  }
  if (error instanceof BudgetReviewExistsError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_REVIEW.PERIOD_EXISTS', error.message, {
      year: error.year,
      month: error.month,
    });
  }
  if (error instanceof BudgetReviewSignedError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_REVIEW.ALREADY_SIGNED', error.message);
  }
  if (error instanceof BudgetReviewNotAwaitingError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_REVIEW.NOT_AWAITING_EXPLANATIONS', error.message, {
      state: error.state,
    });
  }
  if (error instanceof BudgetReviewLineNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET_REVIEW.LINE_NOT_FOUND', error.message);
  }
  if (error instanceof BudgetReviewNotAskedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_REVIEW.EXPLANATION_NOT_REQUIRED', error.message, {
      explanationStatus: error.status,
    });
  }
  if (error instanceof BudgetReviewSeatMonthsError) {
    return refuse(
      HttpStatus.CONFLICT,
      'BUDGET_REVIEW.SEAT_MONTHS_NOT_READY',
      error.message,
      error.subscriptionIds.length > 0 ? { subscriptionIds: [...error.subscriptionIds] } : undefined,
    );
  }

  return toBudgetApiException(error);
}

const example = (error: Error) => errorExampleOf(toBudgetReviewApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const BUDGET_REVIEW_ERROR_EXAMPLES = {
  NOT_FOUND: example(new BudgetReviewNotFoundError()),
  MONTH_NOT_ENDED: example(new BudgetReviewMonthNotEndedError(2026, 11)),
  NO_BUDGET_FOR_YEAR: example(new BudgetReviewNoBudgetError(2025)),
  PERIOD_EXISTS: example(new BudgetReviewExistsError(2026, 10)),
  ALREADY_SIGNED: example(new BudgetReviewSignedError()),
  SEAT_MONTHS_NOT_READY: example(new BudgetReviewSeatMonthsError(undefined, ['<subscription-id>'])),
  NOT_AWAITING_EXPLANATIONS: example(new BudgetReviewNotAwaitingError('SIGNED')),
  LINE_NOT_FOUND: example(new BudgetReviewLineNotFoundError()),
  EXPLANATION_NOT_REQUIRED: example(new BudgetReviewNotAskedError('NOT_REQUIRED')),
} as const;
