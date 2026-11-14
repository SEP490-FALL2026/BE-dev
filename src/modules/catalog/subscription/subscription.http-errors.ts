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
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import {
  SubscriptionApplicationRetiredError,
  SubscriptionBillingCycleUnsupportedError,
  SubscriptionBillingLongerThanCommitmentError,
  SubscriptionCommitmentTermNotAllowedError,
  SubscriptionCommitmentTermRequiredError,
  SubscriptionK1MonthlyOnlyError,
  SubscriptionPrimaryConflictError,
  SubscriptionPrimaryNotEligibleError,
  SubscriptionResponsibleNotItAdminError,
  SubscriptionResponsibleRequiredError,
  SubscriptionVendorAdminsRequiredError,
  SubscriptionDatesInvalidError,
  SubscriptionDuplicatePlanError,
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

  // The pool of a K2 or K4 plan is one: a second live subscription is refused once the seat baseline is closed (`QĐ-104k`(3)).
  if (error instanceof SubscriptionDuplicatePlanError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.DUPLICATE_PLAN', error.message, {
      subscriptionIds: [...error.subscriptionIds],
    });
  }
  if (error instanceof SubscriptionCommitmentTermRequiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.COMMITMENT_TERM_REQUIRED', error.message);
  }
  if (error instanceof SubscriptionCommitmentTermNotAllowedError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.COMMITMENT_TERM_NOT_ALLOWED', error.message);
  }
  if (error instanceof SubscriptionK1MonthlyOnlyError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.K1_MONTHLY_ONLY', error.message);
  }
  if (error instanceof SubscriptionBillingLongerThanCommitmentError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.BILLING_LONGER_THAN_COMMITMENT', error.message);
  }
  if (error instanceof SubscriptionBillingCycleUnsupportedError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED', error.message, {
      billingCycle: error.billingCycle,
    });
  }
  if (error instanceof SubscriptionVendorAdminsRequiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.VENDOR_ADMINS_REQUIRED', error.message, {
      planId: error.planId,
      given: error.given,
      required: error.required,
    });
  }
  if (error instanceof SubscriptionResponsibleRequiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.RESPONSIBLE_REQUIRED', error.message);
  }
  if (error instanceof SubscriptionResponsibleNotItAdminError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN', error.message);
  }
  if (error instanceof SubscriptionPrimaryNotEligibleError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PRIMARY_NOT_ELIGIBLE', error.message, { reason: error.reason });
  }
  if (
    error instanceof SubscriptionPrimaryConflictError ||
    isUniqueViolation(error, 'subscriptions_one_primary_per_plan')
  ) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.PRIMARY_CONFLICT', new SubscriptionPrimaryConflictError().message);
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
  COMMITMENT_TERM_REQUIRED: example(new SubscriptionCommitmentTermRequiredError()),
  COMMITMENT_TERM_NOT_ALLOWED: example(new SubscriptionCommitmentTermNotAllowedError()),
  K1_MONTHLY_ONLY: example(new SubscriptionK1MonthlyOnlyError()),
  BILLING_LONGER_THAN_COMMITMENT: example(new SubscriptionBillingLongerThanCommitmentError()),
  BILLING_CYCLE_UNSUPPORTED: example(new SubscriptionBillingCycleUnsupportedError('QUARTERLY')),
  RESPONSIBLE_REQUIRED: example(new SubscriptionResponsibleRequiredError()),
  VENDOR_ADMINS_REQUIRED: example(new SubscriptionVendorAdminsRequiredError('<plan-id>', 1, 2)),
  RESPONSIBLE_NOT_IT_ADMIN: example(new SubscriptionResponsibleNotItAdminError()),
  PRIMARY_NOT_ELIGIBLE: example(new SubscriptionPrimaryNotEligibleError('NOT_ACTIVE')),
  PRIMARY_CONFLICT: example(new SubscriptionPrimaryConflictError()),
  DUPLICATE_PLAN: example(new SubscriptionDuplicatePlanError(['<subscription-id>'])),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2)),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError()),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
  REPORTING_CURRENCY_NOT_SUPPORTED: example(new ReportingCurrencyNotSupportedError('XYZ')),
} as const;
