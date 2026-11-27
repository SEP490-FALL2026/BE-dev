import type { BusinessDate } from '../../../../core/business-date';

export type SeatPurchaseNotPurchasableReason =
  'PERIOD_NOT_ACTIVE' | 'NOT_FIXED_SEAT_COUNTING' | 'NOT_K2' | 'NOT_SERVING_ON_DATE';

export interface SeatPurchaseRefItem {
  requestId: string;
  beneficiaryEmployeeId: string;
}

/** Subscription line does not exist (`SUBSCRIPTION_LINE.NOT_FOUND`). */
export class SeatPurchaseLineNotFoundError extends Error {
  constructor() {
    super('Subscription line was not found.');
    this.name = 'SeatPurchaseLineNotFoundError';
  }
}

/** Caller is not an acting IT Admin for the beneficiary department of one or more items (`SEAT_PURCHASE.NOT_IN_CHARGE`). */
export class SeatPurchaseNotInChargeError extends Error {
  constructor(readonly items: readonly SeatPurchaseRefItem[]) {
    super('Only the acting IT Admin of the beneficiary department may record this purchase.');
    this.name = 'SeatPurchaseNotInChargeError';
  }
}

/** Target line cannot take a seat purchase (`SEAT_PURCHASE.LINE_NOT_PURCHASABLE`). */
export class SeatPurchaseLineNotPurchasableError extends Error {
  constructor(readonly reason: SeatPurchaseNotPurchasableReason) {
    super(`This subscription line cannot accept a seat purchase: ${reason}.`);
    this.name = 'SeatPurchaseLineNotPurchasableError';
  }
}

/** Purchase date cannot be in the future (`VALIDATION_ERROR` on `purchasedOn`). */
export class SeatPurchaseInFutureError extends Error {
  constructor(readonly today: BusinessDate) {
    super(`The purchase date cannot be after today (${today}).`);
    this.name = 'SeatPurchaseInFutureError';
  }
}

/** Purchase date cannot be before the subscription period started (`VALIDATION_ERROR` on `purchasedOn`). */
export class SeatPurchaseBeforePeriodError extends Error {
  constructor(readonly startDate: BusinessDate) {
    super(`The purchase date cannot be before the period start date (${startDate}).`);
    this.name = 'SeatPurchaseBeforePeriodError';
  }
}

/** One or more items are not pending spend-approved K2 grant tasks without a prior TOP_UP (`SEAT_PURCHASE.ITEM_NOT_PENDING`). */
export class SeatPurchaseItemNotPendingError extends Error {
  constructor(readonly items: readonly SeatPurchaseRefItem[]) {
    super('One or more items do not match a spend-approved pending grant task of this plan without a prior purchase.');
    this.name = 'SeatPurchaseItemNotPendingError';
  }
}

/** Requested seat count exceeds remaining need `pending - free` (`SEAT_PURCHASE.STOCK_AVAILABLE`). */
export class SeatPurchaseStockAvailableError extends Error {
  constructor(readonly free: number) {
    super(`Cannot buy more seats than needed beyond the ${free} free seat(s) already available in the pool.`);
    this.name = 'SeatPurchaseStockAvailableError';
  }
}

/** Tier-step purchase requires exactly one pending request item (`SEAT_PURCHASE.TIER_STEP_ONE_ITEM`). */
export class SeatPurchaseTierStepOneItemError extends Error {
  constructor() {
    super('A tier-step purchase must reference exactly one pending request item.');
    this.name = 'SeatPurchaseTierStepOneItemError';
  }
}

/** Combining tierStepSeats and replacesFromLineId in one purchase is forbidden (`VALIDATION_ERROR`). */
export class SeatPurchaseConflictingModeError extends Error {
  constructor() {
    super('Cannot combine tierStepSeats and replacesFromLineId in the same seat purchase.');
    this.name = 'SeatPurchaseConflictingModeError';
  }
}

/** Seat-type replacement purchase requires exactly one pending request item (`VALIDATION_ERROR`). */
export class SeatPurchaseReplacementOneItemError extends Error {
  constructor() {
    super('Switching seat type (replacesFromLineId) requires exactly one pending request item.');
    this.name = 'SeatPurchaseReplacementOneItemError';
  }
}

/** Source line and target line for seat-type switch cannot be the same line (`VALIDATION_ERROR`). */
export class SeatPurchaseReplacementSameLineError extends Error {
  constructor() {
    super('replacesFromLineId must differ from the target subscription line.');
    this.name = 'SeatPurchaseReplacementSameLineError';
  }
}
