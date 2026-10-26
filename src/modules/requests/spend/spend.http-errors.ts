import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  AccessRequestGroupUsesLinesError,
  AccessRequestNotFoundError,
  AccessRequestPlanLineRefusedError,
} from '../access-request/access-request.errors';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import type { BlockedReason } from './spend-decision.policy';
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

/**
 * The answer of a spend decision that was checked again and went back instead of being decided: to Finance, or to the head
 * with the reason its data is at fault. Nothing was decided.
 */
export function toRecheckedApiException(
  bounced: { to: 'FINANCE_REVIEW' } | { to: 'HEAD'; reason: BlockedReason },
): ApiException {
  return new ApiException(HttpStatus.CONFLICT, {
    code: bounced.to === 'FINANCE_REVIEW' ? 'SPEND.RECHECKED_NEEDS_FINANCE_REVIEW' : 'SPEND.RECHECKED_RETURNED_TO_HEAD',
    message:
      bounced.to === 'FINANCE_REVIEW'
        ? 'The request was checked again, is now an exception that Finance has not reviewed, and went back to Finance. Nothing was decided.'
        : 'The request was checked again, its data is at fault, and it went back to its head. Nothing was decided.',
    ...(bounced.to === 'HEAD' ? { details: { reason: bounced.reason } } : {}),
  });
}

const example = (error: Error) => errorExampleOf(toSpendApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const SPEND_ERROR_EXAMPLES = {
  REQUEST_NOT_FOUND: example(new AccessRequestNotFoundError()),
  GROUP_USES_LINES: example(new AccessRequestGroupUsesLinesError()),
  PLAN_LINE_NOT_FOUND: example(new AccessRequestPlanLineRefusedError('LINE_NOT_FOUND')),
  STILL_NEEDED_REQUIRED: example(new AccessRequestPlanLineRefusedError('STILL_NEEDED_REQUIRED')),
  REVIEW_NOT_FOUND: example(new SpendReviewNotFoundError()),
  NOT_FINANCE: example(new SpendNotFinanceError()),
  REVIEW_NOT_OPEN: example(new SpendReviewNotOpenError()),
  PLAN_LINE_NOT_UPDATED: example(new SpendReviewRefusedError('PLAN_LINE_NOT_UPDATED')),
  NO_BUDGET_TO_MAKE: example(new SpendReviewRefusedError('NO_BUDGET_TO_MAKE')),
  NO_HEAD_TO_PROPOSE: example(new SpendReviewRefusedError('NO_HEAD_TO_PROPOSE')),
  NOT_HEAD: example(new SpendNotHeadError()),
  NOT_IN_QUEUE: example(new SpendNotInQueueError('<request-id>')),
  BATCH_NOT_FOUND: example(new SpendBatchNotFoundError()),
  NOT_THE_ASSIGNEE: example(new SpendDecisionRefusedError('NOT_THE_ASSIGNEE')),
  OWN_REQUEST: example(new SpendDecisionRefusedError('OWN_REQUEST')),
  NO_SPEND_STEP: example(new SpendDecisionRefusedError('NO_SPEND_STEP')),
  NOT_CHECKABLE: example(new SpendDecisionRefusedError('NOT_CHECKABLE')),
  OVERRIDE_REQUIRED: example(new SpendDecisionRefusedError('OVERRIDE_REQUIRED', [2026])),
  OVERRIDE_MISMATCH: example(new SpendDecisionRefusedError('OVERRIDE_MISMATCH', [2026])),
  OVERRIDE_NOT_NEEDED: example(new SpendDecisionRefusedError('OVERRIDE_NOT_NEEDED')),
  RECHECKED_NEEDS_FINANCE_REVIEW: example(toRecheckedApiException({ to: 'FINANCE_REVIEW' })),
  RECHECKED_RETURNED_TO_HEAD: example(toRecheckedApiException({ to: 'HEAD', reason: 'STALE_COST_EVIDENCE' })),
  INFORMATION_NOT_FOUND: example(new BudgetInformationNotFoundError()),
  INFORMATION_NOT_THE_ASSIGNEE: example(new BudgetInformationRefusedError('NOT_THE_ASSIGNEE')),
  INFORMATION_OWN_REQUEST: example(new BudgetInformationRefusedError('OWN_REQUEST')),
  INFORMATION_NO_SPEND_STEP: example(new BudgetInformationRefusedError('NO_SPEND_STEP')),
  INFORMATION_ALREADY_OPEN: example(new BudgetInformationRefusedError('ALREADY_OPEN')),
  INFORMATION_SOD_APPROVER: example(new BudgetInformationRefusedError('SOD_APPROVER')),
  INFORMATION_NOT_OPEN: example(new BudgetInformationRefusedError('NOT_OPEN')),
} as const;
