import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
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
