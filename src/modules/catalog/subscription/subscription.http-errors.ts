import { HttpStatus } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  CurrencyNotSupportedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from '../../../core/money/money.errors';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import {
  WorkspaceNotFoundError,
  WorkspaceRequiredError,
  WorkspaceVendorMismatchError,
} from '../workspace/workspace.errors';
import {
  SubscriptionLineLiveTakenError,
  SubscriptionLinePlanNotK2Error,
  SubscriptionLinePlanTakenError,
  SubscriptionLinePriceNotVndError,
} from '../subscription-line/subscription-line.errors';
import {
  SubscriptionApplicationRetiredError,
  SubscriptionPriceMismatchError,
  SubscriptionPriceNotVndError,
  SubscriptionBillingCycleUnsupportedError,
  SubscriptionBillingLongerThanCommitmentError,
  SubscriptionCommitmentTermNotAllowedError,
  SubscriptionCommitmentTermRequiredError,
  SubscriptionK1HasNoSubscriptionError,
  SubscriptionK1MonthlyOnlyError,
  SubscriptionMembersMonthlyOnlyError,
  SubscriptionMembersPaymentDayRequiredError,
  SubscriptionSeatCountingFixedError,
  SubscriptionK4PerpetualOnlyError,
  SubscriptionMidTermReductionNotAllowedError,
  SubscriptionPerpetualIsLicenseLotError,
  SubscriptionPrimaryConflictError,
  SubscriptionPrimaryRetiredError,
  SubscriptionLinesXorPlanError,
  SubscriptionSeatCountViaLedgerError,
  SubscriptionQuantityReasonRequiredError,
  SubscriptionStaleError,
  SubscriptionPrimaryNotEligibleError,
  SubscriptionResponsibleNotItAdminError,
  SubscriptionResponsibleRequiredError,
  SubscriptionVendorAdminsRequiredError,
  SubscriptionVersionRequiredError,
  SubscriptionDatesInvalidError,
  SubscriptionDuplicatePlanError,
  SubscriptionNotFoundError,
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
  if (error instanceof WorkspaceRequiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.WORKSPACE_REQUIRED', error.message, {
      workspaceIds: error.workspaceIds,
    });
  }
  if (error instanceof WorkspaceVendorMismatchError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.WORKSPACE_VENDOR_MISMATCH', error.message);
  }
  if (error instanceof WorkspaceNotFoundError)
    return refuse(HttpStatus.NOT_FOUND, 'WORKSPACE.NOT_FOUND', error.message);
  if (error instanceof SubscriptionMembersMonthlyOnlyError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.MEMBERS_MONTHLY_ONLY', error.message);
  }
  if (error instanceof SubscriptionMembersPaymentDayRequiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.MEMBERS_PAYMENT_DAY_REQUIRED', error.message);
  }
  if (error instanceof SubscriptionSeatCountingFixedError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.SEAT_COUNTING_FIXED', error.message);
  }
  if (error instanceof SubscriptionSeatCountViaLedgerError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER', error.message, { routes: error.routes });
  }
  if (error instanceof SubscriptionPrimaryRetiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PRIMARY_RETIRED', error.message);
  }
  if (error instanceof SubscriptionK1HasNoSubscriptionError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION', error.message);
  }
  if (error instanceof SubscriptionPerpetualIsLicenseLotError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT', error.message);
  }
  if (error instanceof SubscriptionLinesXorPlanError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.LINES_XOR_PLAN', error.message);
  }
  if (error instanceof SubscriptionLinePlanNotK2Error) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION_LINE.PLAN_NOT_K2', error.message);
  }
  if (error instanceof SubscriptionLinePriceNotVndError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION_LINE.PRICE_NOT_VND', error.message, { currency: error.currency });
  }
  if (error instanceof SubscriptionLineLiveTakenError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.DUPLICATE_PLAN', error.message);
  }
  if (error instanceof SubscriptionLinePlanTakenError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.DUPLICATE_PLAN', error.message);
  }
  if (error instanceof ApiException) return error;

  if (error instanceof SubscriptionNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SUBSCRIPTION.NOT_FOUND', error.message);
  }
  if (error instanceof SubscriptionPlanNotFoundError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PLAN_NOT_FOUND', error.message);
  }
  if (error instanceof SubscriptionApplicationRetiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.APPLICATION_RETIRED', error.message);
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
  if (error instanceof SubscriptionPriceNotVndError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PRICE_NOT_VND', error.message, { currency: error.currency });
  }
  if (error instanceof SubscriptionPriceMismatchError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PRICE_MISMATCH', error.message, {
      expectedUnitPrice: {
        amount: formatAmount(error.expectedUnitPriceMinor, 0),
        currency: error.currency,
      },
    });
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
  if (error instanceof SubscriptionK4PerpetualOnlyError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.K4_PERPETUAL_ONLY', error.message);
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
  if (error instanceof SubscriptionStaleError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.STALE', error.message, {
      currentUpdatedAt: error.currentUpdatedAt.toISOString(),
    });
  }
  if (error instanceof SubscriptionVersionRequiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.VERSION_REQUIRED', error.message);
  }
  if (error instanceof SubscriptionMidTermReductionNotAllowedError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED', error.message);
  }
  if (error instanceof SubscriptionQuantityReasonRequiredError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.QUANTITY_REASON_REQUIRED', error.message);
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
  APPLICATION_RETIRED: example(new SubscriptionApplicationRetiredError()),
  PLAN_HAS_NO_SUBSCRIPTION: example(new SubscriptionPlanHasNoSubscriptionError()),
  PERPETUAL_NEEDS_LICENSED_APPLICATION: example(new SubscriptionPerpetualNeedsLicensedApplicationError()),
  PERPETUAL_HAS_NO_TERM: example(new SubscriptionPerpetualHasNoTermError(['endDate'])),
  DATES_INVALID: example(new SubscriptionDatesInvalidError('START_AFTER_END')),
  UPDATE_EMPTY: example(new SubscriptionUpdateEmptyError()),
  QUANTITY_BELOW_OCCUPIED: example(new SubscriptionQuantityBelowOccupiedError(3, 2)),
  STILL_DRAFT: example(new SubscriptionStillDraftError(['UNIT_PRICE'])),
  PRICE_NOT_VND: example(new SubscriptionPriceNotVndError('USD')),
  PRICE_MISMATCH: example(new SubscriptionPriceMismatchError(6_000_000n)),
  COMMITMENT_TERM_REQUIRED: example(new SubscriptionCommitmentTermRequiredError()),
  COMMITMENT_TERM_NOT_ALLOWED: example(new SubscriptionCommitmentTermNotAllowedError()),
  K1_MONTHLY_ONLY: example(new SubscriptionK1MonthlyOnlyError()),
  K4_PERPETUAL_ONLY: example(new SubscriptionK4PerpetualOnlyError()),
  BILLING_LONGER_THAN_COMMITMENT: example(new SubscriptionBillingLongerThanCommitmentError()),
  BILLING_CYCLE_UNSUPPORTED: example(new SubscriptionBillingCycleUnsupportedError('OTHER')),
  RESPONSIBLE_REQUIRED: example(new SubscriptionResponsibleRequiredError()),
  VENDOR_ADMINS_REQUIRED: example(new SubscriptionVendorAdminsRequiredError('<plan-id>', 1, 2)),
  RESPONSIBLE_NOT_IT_ADMIN: example(new SubscriptionResponsibleNotItAdminError()),
  PRIMARY_NOT_ELIGIBLE: example(new SubscriptionPrimaryNotEligibleError('NOT_ACTIVE')),
  PRIMARY_CONFLICT: example(new SubscriptionPrimaryConflictError()),
  STALE: example(new SubscriptionStaleError(new Date('2026-01-01T00:00:00.000Z'))),
  VERSION_REQUIRED: example(new SubscriptionVersionRequiredError()),
  MID_TERM_REDUCTION_NOT_ALLOWED: example(new SubscriptionMidTermReductionNotAllowedError()),
  QUANTITY_REASON_REQUIRED: example(new SubscriptionQuantityReasonRequiredError()),
  DUPLICATE_PLAN: example(new SubscriptionDuplicatePlanError(['<subscription-id>'])),
  WORKSPACE_REQUIRED: example(new WorkspaceRequiredError(['<workspace-id>', '<other-workspace-id>'])),
  WORKSPACE_VENDOR_MISMATCH: example(new WorkspaceVendorMismatchError()),
  WORKSPACE_NOT_FOUND: example(new WorkspaceNotFoundError()),
  MEMBERS_MONTHLY_ONLY: example(new SubscriptionMembersMonthlyOnlyError()),
  MEMBERS_PAYMENT_DAY_REQUIRED: example(new SubscriptionMembersPaymentDayRequiredError()),
  SEAT_COUNTING_FIXED: example(new SubscriptionSeatCountingFixedError()),
  SEAT_COUNT_VIA_LEDGER: example(new SubscriptionSeatCountViaLedgerError(['subscriptionLineSeatPurchase'])),
  PRIMARY_RETIRED: example(new SubscriptionPrimaryRetiredError()),
  K1_HAS_NO_SUBSCRIPTION: example(new SubscriptionK1HasNoSubscriptionError()),
  PERPETUAL_IS_LICENSE_LOT: example(new SubscriptionPerpetualIsLicenseLotError()),
  LINES_XOR_PLAN: example(new SubscriptionLinesXorPlanError()),
  LINE_PLAN_NOT_K2: example(new SubscriptionLinePlanNotK2Error()),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2, 'unitPrice')),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError('unitPrice')),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ', 'originalPrice')),
} as const;
