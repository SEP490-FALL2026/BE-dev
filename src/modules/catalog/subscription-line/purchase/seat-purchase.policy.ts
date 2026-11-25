import { addDays, type BusinessDate } from '../../../../core/business-date';
import { nextBillingBoundary, proratedSeatAmount, type BillingCycleKind } from '../../../../core/seat-month-cost';
import { assertManualEffectiveOn } from '../ledger/seat-ledger.policy';
import type { SubscriptionLineRecord } from '../subscription-line.types';
import {
  SeatPurchaseBeforePeriodError,
  SeatPurchaseInFutureError,
  SeatPurchaseLineNotPurchasableError,
  SeatPurchaseStockAvailableError,
} from './seat-purchase.errors';

export interface LinePurchasabilityInput {
  line: Pick<SubscriptionLineRecord, 'ledgerOpenedOn' | 'closedOn' | 'closedReason'>;
  period: {
    status: string;
    seatCounting: string;
    startDate: BusinessDate | null;
    endDate: BusinessDate | null;
  };
  provisioningType: string;
  purchasedOn: BusinessDate;
}

function isServingOnPurchaseDate(
  line: LinePurchasabilityInput['line'],
  period: LinePurchasabilityInput['period'],
  purchasedOn: BusinessDate,
): boolean {
  if (line.closedReason === 'REMOVED' || line.closedReason === 'ENDED') return false;
  if (line.closedOn !== null && purchasedOn > line.closedOn) return false;
  if (period.endDate !== null && purchasedOn > period.endDate) return false;
  const withinPeriodStart = period.startDate === null || purchasedOn >= period.startDate;

  return !(withinPeriodStart && line.ledgerOpenedOn !== null && purchasedOn < line.ledgerOpenedOn);
}

/** Step 2 check (`W3-18`): line must serve `purchasedOn`, period ACTIVE, seatCounting FIXED, and plan K2. */
export function assertLinePurchasableForPurchase(input: LinePurchasabilityInput): void {
  if (input.period.status !== 'ACTIVE') {
    throw new SeatPurchaseLineNotPurchasableError('PERIOD_NOT_ACTIVE');
  }
  if (input.period.seatCounting !== 'FIXED') {
    throw new SeatPurchaseLineNotPurchasableError('NOT_FIXED_SEAT_COUNTING');
  }
  if (input.provisioningType !== 'K2') {
    throw new SeatPurchaseLineNotPurchasableError('NOT_K2');
  }
  if (!isServingOnPurchaseDate(input.line, input.period, input.purchasedOn)) {
    throw new SeatPurchaseLineNotPurchasableError('NOT_SERVING_ON_DATE');
  }
}

/** Step 3 check (`W3-18`): `purchasedOn` must be <= `today`, >= `periodStartDate`, and inside an open month. */
export function assertPurchaseDateWithinBounds(input: {
  purchasedOn: BusinessDate;
  today: BusinessDate;
  periodStartDate: BusinessDate | null;
}): void {
  if (input.purchasedOn > input.today) {
    throw new SeatPurchaseInFutureError(input.today);
  }
  if (input.periodStartDate !== null && input.purchasedOn < input.periodStartDate) {
    throw new SeatPurchaseBeforePeriodError(input.periodStartDate);
  }
  assertManualEffectiveOn(input.purchasedOn, input.today);
}

/** Step 5 check (`W3-18`): `requestedCount <= pendingCount - freeOnPurchasedOn`, else 409 STOCK_AVAILABLE. */
export function assertStockAllowsSeatPurchase(input: {
  requestedCount: number;
  pendingCount: number;
  freeOnPurchasedOn: number;
}): void {
  const maxBuyable = Math.max(0, input.pendingCount - input.freeOnPurchasedOn);
  if (input.requestedCount > maxBuyable) {
    throw new SeatPurchaseStockAvailableError(input.freeOnPurchasedOn);
  }
}

/**
 * Expected invoice amount for a purchase of `seats` on `purchasedOn` (`W3-18`):
 * `roundHalfAway(seats * monthlyUnitPriceMinor * cover(purchasedOn, R - 1))` (single rounding per purchase).
 */
export function seatPurchaseExpectedAmount(input: {
  seats: number;
  monthlyUnitPriceMinor: bigint;
  billingCycle: BillingCycleKind | null;
  renewalDate: BusinessDate | null;
  endDate: BusinessDate | null;
  purchasedOn: BusinessDate;
}): bigint | null {
  const boundary = nextBillingBoundary({
    billingCycle: input.billingCycle,
    renewalDate: input.renewalDate,
    endDate: input.endDate,
    fromDate: input.purchasedOn,
  });
  if (boundary === null) return null;

  return proratedSeatAmount({
    monthlyMinor: input.monthlyUnitPriceMinor,
    seats: input.seats,
    from: input.purchasedOn,
    untilExclusive: boundary,
  });
}

/** Whether a seat purchase's invoice is overdue on `today` (`invoiceDueOn < today`; equal day does NOT remind). */
export function isSeatPurchaseInvoiceOverdue(invoiceDueOn: BusinessDate | null, today: BusinessDate): boolean {
  return invoiceDueOn !== null && invoiceDueOn < today;
}

/**
 * R1 recipient rule for `SUBSCRIPTION_SEATS_BOUGHT` (`W3-18`, §8.1): responsible IT Admin if usable and not actor,
 * else usable Super Admin if not actor.
 */
export function seatPurchaseRecipients(input: {
  responsible: string | null;
  responsibleUsable: boolean;
  superAdmin: string | null;
  actor: string;
}): string[] {
  if (input.responsible !== null && input.responsibleUsable) {
    return input.responsible === input.actor ? [] : [input.responsible];
  }

  return input.superAdmin !== null && input.superAdmin !== input.actor ? [input.superAdmin] : [];
}

/** Resolves `recordedBy + R1` deduplicated recipients for `SEAT_PURCHASE_INVOICE_OVERDUE` (`W3-18`, §8.2). */
export function overduePurchaseInvoiceRecipients(input: {
  recorder: string;
  recorderUsable: boolean;
  responsible: string | null;
  responsibleUsable: boolean;
  superAdmin: string | null;
}): string[] {
  const recipients = new Set<string>();
  if (input.recorderUsable) recipients.add(input.recorder);
  if (input.responsible !== null && input.responsibleUsable) {
    recipients.add(input.responsible);
  } else if (input.superAdmin !== null) {
    recipients.add(input.superAdmin);
  }

  return [...recipients];
}

export function seatPurchasePeriodCutoff(
  billingCycle: BillingCycleKind | null,
  renewalDate: BusinessDate | null,
  endDate: BusinessDate | null,
  purchasedOn: BusinessDate,
): BusinessDate | null {
  const boundary = nextBillingBoundary({ billingCycle, renewalDate, endDate, fromDate: purchasedOn });

  return boundary === null ? null : addDays(boundary, -1);
}
