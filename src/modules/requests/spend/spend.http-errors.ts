import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import type { ReturnReason } from './spend-decision.policy';
import {
  SpendBatchNotFoundError,
  SpendConfirmationNotInBatchError,
  SpendDecisionRefusedError,
  SpendNotHeadError,
  SpendNotInQueueError,
  SpendReserveRefusedError,
  SpendReviewNotFoundError,
  SpendSupplementRefusedError,
} from './spend.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the check of the budget and of the spend steps to their HTTP answers; the rest are the request's own. */
export function toSpendApiException(error: unknown): unknown {
  if (error instanceof SpendReviewNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SPEND.REVIEW_NOT_FOUND', error.message);
  }
  if (error instanceof SpendNotHeadError) return refuse(HttpStatus.FORBIDDEN, 'SPEND.NOT_HEAD', error.message);
  if (error instanceof SpendNotInQueueError) return refuse(HttpStatus.CONFLICT, 'SPEND.NOT_IN_QUEUE', error.message);
  if (error instanceof SpendBatchNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SPEND.BATCH_NOT_FOUND', error.message);
  }
  if (error instanceof SpendConfirmationNotInBatchError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'SPEND_BATCH.CONFIRMATION_NOT_IN_BATCH',
      message: error.message,
      details: { requestId: error.requestId },
    });
  }
  if (error instanceof SpendReserveRefusedError) {
    return refuse(
      error.reason === 'RESERVE_CONFIRMER_IS_BENEFICIARY' ? HttpStatus.FORBIDDEN : HttpStatus.CONFLICT,
      `SPEND.${error.reason}`,
      error.message,
    );
  }
  if (error instanceof SpendDecisionRefusedError) {
    const forbidden = error.reason === 'NOT_THE_ASSIGNEE' || error.reason === 'OWN_REQUEST';

    return refuse(forbidden ? HttpStatus.FORBIDDEN : HttpStatus.CONFLICT, `SPEND.${error.reason}`, error.message);
  }
  if (error instanceof SpendSupplementRefusedError) {
    return refuse(HttpStatus.CONFLICT, `SPEND.SUPPLEMENT_${error.reason}`, error.message);
  }

  return toAccessRequestApiException(error);
}

/**
 * The answer of a spend decision that was checked again and went back to the head instead of being decided: the check now blocks the request
 * (`OVER_RESERVE`, `NO_APPROVED_BUDGET` — also when the Cost Center changed — `PRICE_EXPIRED`), or it uses the reserve and the head has not
 * confirmed it (`RESERVE_UNCONFIRMED`). Nothing was decided; the requester and the head are told.
 */
export function toRecheckedApiException(
  reasons: readonly ReturnReason[],
  to: 'HEAD' | 'REQUESTER' = 'HEAD',
  overBy?: string | null,
): ApiException {
  return new ApiException(HttpStatus.CONFLICT, {
    code: to === 'REQUESTER' ? 'SPEND.RECHECKED_RETURNED_TO_REQUESTER' : 'SPEND.RECHECKED_RETURNED_TO_HEAD',
    message:
      to === 'REQUESTER'
        ? 'The request was checked again and went back to its requester for revision. Nothing was decided.'
        : 'The request was checked again, is blocked or uses the reserve the head has not confirmed, and went back to its head. Nothing was decided.',
    details: { reasons: [...reasons], ...(to === 'REQUESTER' ? { overBy: overBy ?? null } : {}) },
  });
}

const example = (error: Error) => errorExampleOf(toSpendApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const SPEND_ERROR_EXAMPLES = {
  REQUEST_NOT_FOUND: example(new AccessRequestNotFoundError()),
  GROUP_USES_LINES: example(new AccessRequestGroupUsesLinesError()),
  REVIEW_NOT_FOUND: example(new SpendReviewNotFoundError()),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  NOT_HEAD: example(new SpendNotHeadError()),
  NOT_IN_QUEUE: example(new SpendNotInQueueError('<request-id>')),
  BATCH_NOT_FOUND: example(new SpendBatchNotFoundError()),
  CONFIRMATION_NOT_IN_BATCH: example(new SpendConfirmationNotInBatchError('<request-id>')),
  RESERVE_NOT_PENDING: example(new SpendReserveRefusedError('RESERVE_NOT_PENDING')),
  RESERVE_CONFIRMER_IS_BENEFICIARY: example(new SpendReserveRefusedError('RESERVE_CONFIRMER_IS_BENEFICIARY')),
  NOT_THE_ASSIGNEE: example(new SpendDecisionRefusedError('NOT_THE_ASSIGNEE')),
  OWN_REQUEST: example(new SpendDecisionRefusedError('OWN_REQUEST')),
  NO_SPEND_STEP: example(new SpendDecisionRefusedError('NO_SPEND_STEP')),
  NOT_CHECKABLE: example(new SpendDecisionRefusedError('NOT_CHECKABLE')),
  RECHECKED_RETURNED_TO_HEAD: example(toRecheckedApiException(['OVER_RESERVE'])),
  RECHECKED_RETURNED_TO_REQUESTER: example(toRecheckedApiException(['OVER_RESERVE'], 'REQUESTER', '1')),
} as const;
