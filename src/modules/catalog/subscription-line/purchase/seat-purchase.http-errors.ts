import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../../infrastructure/http/openapi-error-examples';
import { EmployeeNotStartedError } from '../../../organization/public/organization.errors';
import {
  SeatPurchaseBeforePeriodError,
  SeatPurchaseConflictingModeError,
  SeatPurchaseInFutureError,
  SeatPurchaseItemNotPendingError,
  SeatPurchaseLineNotFoundError,
  SeatPurchaseLineNotPurchasableError,
  SeatPurchaseNotInChargeError,
  SeatPurchaseReplacementOneItemError,
  SeatPurchaseReplacementSameLineError,
  SeatPurchaseStockAvailableError,
  SeatPurchaseTierStepOneItemError,
} from './seat-purchase.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps seat-purchase domain errors to HTTP exceptions (ledger/unavailable errors handled by `seat-ledger.api.ts`). */
export function toSeatPurchaseApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof SeatPurchaseNotInChargeError) {
    return refuse(HttpStatus.FORBIDDEN, 'SEAT_PURCHASE.NOT_IN_CHARGE', error.message, { items: error.items });
  }
  if (error instanceof SeatPurchaseLineNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SUBSCRIPTION_LINE.NOT_FOUND', error.message);
  }
  if (error instanceof EmployeeNotStartedError) {
    return refuse(HttpStatus.CONFLICT, 'EMPLOYEE.NOT_STARTED', error.message);
  }
  if (error instanceof SeatPurchaseLineNotPurchasableError) {
    return refuse(HttpStatus.CONFLICT, 'SEAT_PURCHASE.LINE_NOT_PURCHASABLE', error.message, { reason: error.reason });
  }
  if (error instanceof SeatPurchaseStockAvailableError) {
    return refuse(HttpStatus.CONFLICT, 'SEAT_PURCHASE.STOCK_AVAILABLE', error.message, { free: error.free });
  }
  if (error instanceof SeatPurchaseInFutureError || error instanceof SeatPurchaseBeforePeriodError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', error.message, {
      issues: [{ code: 'custom', path: 'purchasedOn' }],
    });
  }
  if (error instanceof SeatPurchaseItemNotPendingError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'SEAT_PURCHASE.ITEM_NOT_PENDING', error.message, {
      items: error.items,
    });
  }
  if (error instanceof SeatPurchaseTierStepOneItemError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'SEAT_PURCHASE.TIER_STEP_ONE_ITEM', error.message);
  }
  if (error instanceof SeatPurchaseConflictingModeError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', error.message, {
      issues: [{ code: 'custom', path: 'tierStepSeats' }],
    });
  }
  if (error instanceof SeatPurchaseReplacementOneItemError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', error.message, {
      issues: [{ code: 'custom', path: 'items' }],
    });
  }
  if (error instanceof SeatPurchaseReplacementSameLineError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', error.message, {
      issues: [{ code: 'custom', path: 'replacesFromLineId' }],
    });
  }

  return error;
}

const example = (error: Error) => errorExampleOf(toSeatPurchaseApiException(error));
const PLACEHOLDER_ITEM = { requestId: '<request-id>', beneficiaryEmployeeId: '<employee-id>' };

/** OpenAPI examples produced by `toSeatPurchaseApiException`. */
export const SEAT_PURCHASE_ONLY_ERROR_EXAMPLES = {
  NOT_IN_CHARGE: example(new SeatPurchaseNotInChargeError([PLACEHOLDER_ITEM])),
  LINE_NOT_FOUND: example(new SeatPurchaseLineNotFoundError()),
  EMPLOYEE_NOT_STARTED: example(new EmployeeNotStartedError('<employee-id>')),
  LINE_NOT_PURCHASABLE: example(new SeatPurchaseLineNotPurchasableError('PERIOD_NOT_ACTIVE')),
  STOCK_AVAILABLE: example(new SeatPurchaseStockAvailableError(1)),
  ITEM_NOT_PENDING: example(new SeatPurchaseItemNotPendingError([PLACEHOLDER_ITEM])),
  TIER_STEP_ONE_ITEM: example(new SeatPurchaseTierStepOneItemError()),
  DATE_IN_FUTURE: example(new SeatPurchaseInFutureError('2026-01-01')),
} as const;
