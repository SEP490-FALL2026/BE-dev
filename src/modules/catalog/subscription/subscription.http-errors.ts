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
import { formatRatePercent } from '../../../core/money/tax-estimate';
import {
  CostAllocationCostCenterDuplicateError,
  CostAllocationCostCenterRefusedError,
  CostAllocationLineCountError,
  CostAllocationRatioInvalidError,
  CostAllocationSubscriptionNotFoundError,
  CostAllocationTotalError,
} from '../../finance/finance.errors';
import {
  SubscriptionCostAllocationNotApplicableError,
  SubscriptionDatesInvalidError,
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
  if (error instanceof ApiException) return error;

  if (error instanceof SubscriptionNotFoundError || error instanceof CostAllocationSubscriptionNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SUBSCRIPTION.NOT_FOUND', error.message);
  }
  if (error instanceof SubscriptionPlanNotFoundError) {
    return refuse(UNPROCESSABLE, 'SUBSCRIPTION.PLAN_NOT_FOUND', error.message);
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

  if (error instanceof SubscriptionCostAllocationNotApplicableError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION.COST_ALLOCATION_NOT_APPLICABLE', error.message, {
      reason: error.reason,
    });
  }
  if (error instanceof CostAllocationTotalError) {
    return refuse(UNPROCESSABLE, 'COST_ALLOCATION.TOTAL_NOT_100', error.message, {
      totalPercent: formatRatePercent(error.totalBp),
    });
  }
  if (error instanceof CostAllocationRatioInvalidError) {
    return refuse(UNPROCESSABLE, 'COST_ALLOCATION.RATIO_INVALID', error.message, { costCenterId: error.costCenterId });
  }
  if (error instanceof CostAllocationCostCenterDuplicateError) {
    return refuse(UNPROCESSABLE, 'COST_ALLOCATION.COST_CENTER_DUPLICATE', error.message, {
      costCenterId: error.costCenterId,
    });
  }
  if (error instanceof CostAllocationLineCountError) {
    return refuse(UNPROCESSABLE, 'COST_ALLOCATION.LINE_COUNT_INVALID', error.message, { lines: error.lines });
  }
  if (error instanceof CostAllocationCostCenterRefusedError) {
    return refuse(UNPROCESSABLE, `COST_ALLOCATION.COST_CENTER_${error.reason}`, error.message, {
      costCenterIds: error.costCenterIds,
    });
  }

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toSubscriptionApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const SUBSCRIPTION_ERROR_EXAMPLES = {
  NOT_FOUND: example(new SubscriptionNotFoundError()),
  PLAN_NOT_FOUND: example(new SubscriptionPlanNotFoundError()),
  PLAN_HAS_NO_SUBSCRIPTION: example(new SubscriptionPlanHasNoSubscriptionError()),
  PERPETUAL_NEEDS_LICENSED_APPLICATION: example(new SubscriptionPerpetualNeedsLicensedApplicationError()),
  PERPETUAL_HAS_NO_TERM: example(new SubscriptionPerpetualHasNoTermError(['endDate'])),
  DATES_INVALID: example(new SubscriptionDatesInvalidError('START_AFTER_END')),
  UPDATE_EMPTY: example(new SubscriptionUpdateEmptyError()),
  QUANTITY_BELOW_OCCUPIED: example(new SubscriptionQuantityBelowOccupiedError(3, 2)),
  STILL_DRAFT: example(new SubscriptionStillDraftError(['EXCHANGE_RATE'])),
  COST_ALLOCATION_NOT_APPLICABLE: example(new SubscriptionCostAllocationNotApplicableError('PER_SEAT')),
  ALLOCATION_TOTAL_NOT_100: example(new CostAllocationTotalError(9000)),
  ALLOCATION_RATIO_INVALID: example(new CostAllocationRatioInvalidError('<cost-center-id>')),
  ALLOCATION_COST_CENTER_DUPLICATE: example(new CostAllocationCostCenterDuplicateError('<cost-center-id>')),
  ALLOCATION_LINE_COUNT_INVALID: example(new CostAllocationLineCountError(0)),
  ALLOCATION_COST_CENTER_NOT_FOUND: example(
    new CostAllocationCostCenterRefusedError('NOT_FOUND', ['<cost-center-id>']),
  ),
  ALLOCATION_COST_CENTER_INACTIVE: example(new CostAllocationCostCenterRefusedError('INACTIVE', ['<cost-center-id>'])),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2)),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError()),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
  REPORTING_CURRENCY_NOT_SUPPORTED: example(new ReportingCurrencyNotSupportedError('XYZ')),
} as const;
