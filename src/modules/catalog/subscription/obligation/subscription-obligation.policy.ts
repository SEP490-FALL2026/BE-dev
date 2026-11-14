import { addDays, type BusinessDate } from '../../../../core/business-date';
import { deriveNotice } from '../subscription.policy';
import type {
  BillingCycle,
  CommitmentTermMonths,
  DeadlineKind,
  ExpiryState,
  SubscriptionKind,
  SubscriptionState,
} from '../subscription.types';

/** The part of a subscription that says what is owed and for how long: what a change can create, raise or extend. */
export type ObligationState = Pick<
  SubscriptionState,
  'purchasedQuantity' | 'unitPrice' | 'priceSnapshot' | 'endDate' | 'renewalDate' | 'autoRenew'
>;

/** A day later than the stored one, or a day where none was set: a term that gets longer. */
const extended = (next: BusinessDate | null, current: BusinessDate | null): boolean =>
  next !== null && (current === null || next > current);

/**
 * A unit price that is higher than the stored one, or a price where none was recorded. Prices of one currency are compared in
 * that currency; across currencies they are compared in the reporting currency of their frozen conversions, and a price that
 * cannot be shown to be no higher (a conversion is missing) counts as a raise.
 */
function priceRaised(current: ObligationState, next: ObligationState): boolean {
  if (next.unitPrice === null) return false;
  if (current.unitPrice === null) return true;
  if (next.unitPrice.currency === current.unitPrice.currency) {
    return next.unitPrice.amountMinor > current.unitPrice.amountMinor;
  }
  if (next.priceSnapshot && current.priceSnapshot) {
    return next.priceSnapshot.reportingMinor > current.priceSnapshot.reportingMinor;
  }

  return true;
}

/**
 * Whether a change creates, raises or extends what the company owes for a subscription (`QĐ-88a`(2), `QĐ-89a`(3)): more seats bought than stored (or a quantity where there was none), the end or the renewal date later than the stored
 * one (or a date where there was none), auto renewal switched on, a higher unit price (or a price where there was none). A decrease,
 * a correction that raises or extends nothing and the descriptive fields are not obligations. Pure; `current` is the state under
 * the lock of the subscription row.
 */
export function increasesObligation(current: ObligationState, next: ObligationState): boolean {
  if (
    next.purchasedQuantity !== null &&
    (current.purchasedQuantity === null || next.purchasedQuantity > current.purchasedQuantity)
  ) {
    return true;
  }
  if (extended(next.endDate, current.endDate) || extended(next.renewalDate, current.renewalDate)) return true;
  if (!current.autoRenew && next.autoRenew) return true;

  return priceRaised(current, next);
}
/** The days before the payment day of a plan by the month, and before the deadline of a plan by the year, that the point of adjustment opens (`FR-1.4`). */
const MONTHLY_WINDOW_DAYS = 7;
const ANNUAL_WINDOW_DAYS = 30;

export interface AdjustmentInput {
  kind: SubscriptionKind;
  commitmentTermMonths: CommitmentTermMonths | null;
  billingCycle: BillingCycle | null;
  noticeDeadline: BusinessDate | null;
  noticePeriodDays: number | null;
  renewalDate: BusinessDate | null;
  endDate: BusinessDate | null;
  autoRenew: boolean;
}

/** The day the IT Admin has to act by (`deadline`) and the day the subscription enters the list of what ends soon (`point`). */
export interface AdjustmentPoint {
  kind: DeadlineKind;
  deadline: BusinessDate;
  point: BusinessDate;
}

/**
 * A plan by the month commits to one month, or names no commitment and is paid by the month (a personal plan, K1): the rest are plans by
 * the year, whose commitment is twelve months (`QĐ-103e`).
 */
function isByTheMonth(input: AdjustmentInput): boolean {
  return input.commitmentTermMonths === 1 || (input.commitmentTermMonths === null && input.billingCycle === 'MONTHLY');
}

/**
 * The point of adjustment of the period a subscription runs in (`FR-1.4`, `QĐ-103e`, `QĐ-111o`): a plan by the month opens 7 days
 * before its payment day (the renewal day, else the end day) whatever the deadline to cancel says; a plan by the year opens 30 days before the
 * deadline to cancel (declared, or counted back from the renewal day by the days of notice), and, with no deadline and no days of notice, 30
 * days before the renewal day when it renews itself (`QĐ-106i`) or before the end day when it does not. A purchase made once has no period
 * and so no point, and nothing is guessed: with no date to count from there is none. Pure.
 */
export function adjustmentPointOf(input: AdjustmentInput): AdjustmentPoint | null {
  if (input.kind === 'PERPETUAL') return null;
  if (isByTheMonth(input)) {
    const payment = input.renewalDate ?? input.endDate;

    return payment === null
      ? null
      : { kind: 'PAYMENT_DATE', deadline: payment, point: addDays(payment, -MONTHLY_WINDOW_DAYS) };
  }
  const notice = deriveNotice(input);
  if (notice.source === 'DECLARED' || notice.source === 'INFERRED_UNCONFIRMED') {
    return notice.deadline === null ? null : annual('NOTICE_DEADLINE', notice.deadline);
  }
  if (notice.source === 'BY_END_DATE') return notice.baseDate === null ? null : annual('END_DATE', notice.baseDate);
  // No deadline, no days of notice and a plan that renews itself: the renewal day is the deadline (`QĐ-106i`).
  return input.autoRenew && input.renewalDate !== null ? annual('RENEWAL_DATE', input.renewalDate) : null;
}

const annual = (kind: DeadlineKind, deadline: BusinessDate): AdjustmentPoint => ({
  kind,
  deadline,
  point: addDays(deadline, -ANNUAL_WINDOW_DAYS),
});

const DAY_MS = 86_400_000;

/** The whole days from `from` to `to`, negative when `to` is the earlier. */
const daysBetween = (from: BusinessDate, to: BusinessDate): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * Where a subscription stands against its point today: SOON from the day of the point to the day of the deadline, EXPIRED the day after the
 * deadline while seats are still held (`QĐ-98e`: an end that nobody holds a seat under has nothing left to adjust), nothing before the point.
 * `daysLeft` counts to the deadline and is negative once it is past; it is null with no point. Pure.
 */
export function expiryReading(
  point: AdjustmentPoint | null,
  today: BusinessDate,
  holdsSeats: boolean,
): { state: ExpiryState | null; daysLeft: number | null } {
  if (point === null) return { state: null, daysLeft: null };
  const daysLeft = daysBetween(today, point.deadline);
  if (daysLeft < 0) return { state: holdsSeats ? 'EXPIRED' : null, daysLeft };

  return { state: today >= point.point ? 'SOON' : null, daysLeft };
}
