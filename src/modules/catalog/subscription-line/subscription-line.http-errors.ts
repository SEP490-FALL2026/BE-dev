import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { MoneyOutOfRangeError, MoneyScaleExceededError } from '../../../core/money/money.errors';
import { PlanApplicationRetiredError, PlanNotFoundError } from '../plan/plan.errors';
import { WorkspaceNotFoundError, WorkspaceVendorMismatchError } from '../workspace/workspace.errors';
import {
  SubscriptionLineClosedError,
  SubscriptionLinesLimitError,
  SubscriptionLineLiveTakenError,
  SubscriptionLineNotFoundError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLinePeriodNotFoundError,
  SubscriptionLinePeriodNotTermError,
  SubscriptionLinePeriodStaleError,
  SubscriptionLinePeriodStillDraftError,
  SubscriptionLinePlanNotK2Error,
  SubscriptionLinePlanTakenError,
  SubscriptionLinePriceNotVndError,
  SubscriptionLineQuantityViaPurchaseError,
  SubscriptionLineStaleError,
  SubscriptionLineUpdateEmptyError,
} from './subscription-line.errors';

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps subscription-line domain errors to their HTTP exceptions; connectivity issues map to 503. */
export function toSubscriptionLineApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof SubscriptionLineNotResponsibleError) {
    return refuse(HttpStatus.FORBIDDEN, 'SUBSCRIPTION_LINE.NOT_RESPONSIBLE', error.message);
  }
  if (error instanceof SubscriptionLineNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SUBSCRIPTION_LINE.NOT_FOUND', error.message);
  }
  if (error instanceof SubscriptionLinePeriodNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SUBSCRIPTION.NOT_FOUND', error.message);
  }
  if (error instanceof WorkspaceNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'WORKSPACE.NOT_FOUND', error.message);
  }
  if (error instanceof SubscriptionLineStaleError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION_LINE.STALE', error.message, {
      currentUpdatedAt: error.currentUpdatedAt.toISOString(),
    });
  }
  if (error instanceof SubscriptionLinePeriodStaleError) {
    return refuse(
      HttpStatus.CONFLICT,
      'SUBSCRIPTION.STALE',
      error.message,
      error.currentUpdatedAt ? { currentUpdatedAt: error.currentUpdatedAt.toISOString() } : undefined,
    );
  }
  if (error instanceof SubscriptionLineClosedError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION_LINE.CLOSED', error.message);
  }
  if (error instanceof SubscriptionLineLiveTakenError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.DUPLICATE_PLAN', error.message);
  }
  if (error instanceof SubscriptionLinePlanTakenError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.DUPLICATE_PLAN', error.message);
  }
  if (error instanceof SubscriptionLinesLimitError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.LINES_LIMIT', error.message, { limit: error.limit });
  }
  if (error instanceof SubscriptionLineQuantityViaPurchaseError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE', error.message);
  }
  if (error instanceof SubscriptionLinePeriodNotTermError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION_LINE.NOT_TERM', error.message);
  }
  if (error instanceof SubscriptionLinePeriodStillDraftError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.STILL_DRAFT', error.message, { missing: error.missing });
  }
  if (error instanceof SubscriptionLinePlanNotK2Error) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION_LINE.PLAN_NOT_K2', error.message);
  }
  if (error instanceof SubscriptionLinePriceNotVndError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION_LINE.PRICE_NOT_VND', error.message, { currency: error.currency });
  }
  if (error instanceof SubscriptionLineUpdateEmptyError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION_LINE.UPDATE_EMPTY', error.message);
  }
  if (error instanceof WorkspaceVendorMismatchError) {
    return refuse(UNPROCESSABLE, 'WORKSPACE_VENDOR_MISMATCH', error.message);
  }
  if (error instanceof PlanNotFoundError) {
    return refuse(UNPROCESSABLE, 'PLAN.NOT_FOUND', error.message);
  }
  if (error instanceof PlanApplicationRetiredError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.RETIRED', error.message);
  }
  const money = toMoneyApiException(error);
  if (money) return money;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toSubscriptionLineApiException(error));

export const SUBSCRIPTION_LINE_ERROR_EXAMPLES = {
  NOT_RESPONSIBLE: example(new SubscriptionLineNotResponsibleError()),
  NOT_FOUND: example(new SubscriptionLineNotFoundError()),
  PERIOD_NOT_FOUND: example(new SubscriptionLinePeriodNotFoundError()),
  STALE: example(new SubscriptionLineStaleError(new Date('2026-01-01T00:00:00.000Z'))),
  PERIOD_STALE: example(new SubscriptionLinePeriodStaleError(new Date('2026-01-01T00:00:00.000Z'))),
  CLOSED: example(new SubscriptionLineClosedError()),
  DUPLICATE_PLAN: example(new SubscriptionLineLiveTakenError()),
  LINES_LIMIT: example(new SubscriptionLinesLimitError()),
  QUANTITY_VIA_PURCHASE: example(new SubscriptionLineQuantityViaPurchaseError()),
  NOT_TERM: example(new SubscriptionLinePeriodNotTermError()),
  STILL_DRAFT: example(new SubscriptionLinePeriodStillDraftError([])),
  PLAN_NOT_K2: example(new SubscriptionLinePlanNotK2Error()),
  PRICE_NOT_VND: example(new SubscriptionLinePriceNotVndError('USD')),
  UPDATE_EMPTY: example(new SubscriptionLineUpdateEmptyError()),
  WORKSPACE_VENDOR_MISMATCH: example(new WorkspaceVendorMismatchError()),
  PLAN_NOT_FOUND: example(new PlanNotFoundError()),
  APPLICATION_RETIRED: example(new PlanApplicationRetiredError()),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(0, 'monthlyUnitPrice')),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError('monthlyUnitPrice')),
} as const;
