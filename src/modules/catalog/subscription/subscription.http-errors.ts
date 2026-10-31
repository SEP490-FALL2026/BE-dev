import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  CurrencyNotSupportedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
  ReportingCurrencyNotSupportedError,
} from '../../../core/money/money.errors';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import {
  SubscriptionApplicationRetiredError,
  SubscriptionDatesInvalidError,
  SubscriptionNotFoundError,
  SubscriptionOwnerDepartmentInactiveError,
  SubscriptionPerpetualHasNoTermError,
  SubscriptionPerpetualNeedsLicensedApplicationError,
  SubscriptionPlanHasNoSubscriptionError,
  SubscriptionPlanNotFoundError,
  SubscriptionQuantityBelowOccupiedError,
  SubscriptionStillDraftError,
  SubscriptionUpdateEmptyError,
} from './subscription.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

/** Maps the errors of the subscription routes to their HTTP answers; money errors come from the shared mapper. */
export function toSubscriptionApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof SubscriptionNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SUBSCRIPTION.NOT_FOUND', error.message);
  }
  if (error instanceof SubscriptionPlanNotFoundError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PLAN_NOT_FOUND', error.message);
  }
  if (error instanceof SubscriptionOwnerDepartmentInactiveError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE', error.message);
  }
  if (error instanceof SubscriptionApplicationRetiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.APPLICATION_RETIRED', error.message);
  }
  // The owner department has no Cost Center in use yet and the change would create, raise or extend what is owed (`QĐ-88a`(2)).
  if (error instanceof FinanceSetupIncompleteError) {
    return refuse(HttpStatus.CONFLICT, 'FINANCE.SETUP_INCOMPLETE', error.message);
  }
  if (error instanceof SubscriptionPlanHasNoSubscriptionError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION', error.message);
  }
  if (error instanceof SubscriptionPerpetualNeedsLicensedApplicationError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PERPETUAL_NEEDS_LICENSED_APPLICATION', error.message);
  }
  if (error instanceof SubscriptionPerpetualHasNoTermError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PERPETUAL_HAS_NO_TERM', error.message, { fields: error.fields });
  }
  if (error instanceof SubscriptionDatesInvalidError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.DATES_INVALID', error.message, { reason: error.reason });
  }
  if (error instanceof SubscriptionUpdateEmptyError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.UPDATE_EMPTY', error.message);
  }
  if (error instanceof SubscriptionQuantityBelowOccupiedError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED', error.message, {
      occupied: error.occupied,
      requested: error.requested,
    });
  }
  if (error instanceof SubscriptionStillDraftError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.STILL_DRAFT', error.message, { missing: error.missing });
  }

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toSubscriptionApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const SUBSCRIPTION_ERROR_EXAMPLES = {
  NOT_FOUND: example(new SubscriptionNotFoundError()),
  PLAN_NOT_FOUND: example(new SubscriptionPlanNotFoundError()),
  OWNER_DEPARTMENT_INACTIVE: example(new SubscriptionOwnerDepartmentInactiveError()),
  APPLICATION_RETIRED: example(new SubscriptionApplicationRetiredError()),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  PLAN_HAS_NO_SUBSCRIPTION: example(new SubscriptionPlanHasNoSubscriptionError()),
  PERPETUAL_NEEDS_LICENSED_APPLICATION: example(new SubscriptionPerpetualNeedsLicensedApplicationError()),
  PERPETUAL_HAS_NO_TERM: example(new SubscriptionPerpetualHasNoTermError(['endDate'])),
  DATES_INVALID: example(new SubscriptionDatesInvalidError('START_AFTER_END')),
  UPDATE_EMPTY: example(new SubscriptionUpdateEmptyError()),
  QUANTITY_BELOW_OCCUPIED: example(new SubscriptionQuantityBelowOccupiedError(3, 2)),
  STILL_DRAFT: example(new SubscriptionStillDraftError(['EXCHANGE_RATE'])),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2)),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError()),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
  REPORTING_CURRENCY_NOT_SUPPORTED: example(new ReportingCurrencyNotSupportedError('XYZ')),
} as const;
