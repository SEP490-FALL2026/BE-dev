import { addDays, fromDateColumn, toDateColumn, type BusinessDate } from '../../../../core/business-date';
import { addMonths, firstGridOffsetFrom } from '../../../../core/fiscal-year';
import { deriveNotice } from '../subscription.policy';
import type {
  ApplicationKind,
  BillingCycle,
  CommitmentTermMonths,
  DeadlineKind,
  ExpiryState,
  ProvisioningType,
  SubscriptionKind,
  SubscriptionState,
  SubscriptionStatus,
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

/**
 * The days that open a point of adjustment and the red alert, as the Super Admin set them for the period (`FR-1.4`, `FR-8.2`): the days before the
 * payment day of a plan by the month, before the deadline of a plan by the year, and before that deadline again for the red alert of a plan by the year.
 */
export interface AdjustmentWindows {
  monthlyDays: number;
  annualDays: number;
  redAlertDaysAnnual: number;
}

/** The day the red alert opens for a plan by the year, `redAlertDays` before its deadline; a plan by the month has none. */
export function redAlertOf(
  deadline: BusinessDate,
  commitment: 'MONTHLY' | 'ANNUAL',
  redAlertDays: number,
): BusinessDate | null {
  return commitment === 'ANNUAL' ? addDays(deadline, -redAlertDays) : null;
}

export interface AdjustmentInput {
  kind: SubscriptionKind;
  commitmentTermMonths: CommitmentTermMonths | null;
  billingCycle: BillingCycle | null;
  noticeDeadline: BusinessDate | null;
  noticePeriodDays: number | null;
  /** The day the plan began: no payment day of a plan by the month falls before it (a bound, never an anchor: nothing is guessed from it). */
  startDate: BusinessDate | null;
  renewalDate: BusinessDate | null;
  endDate: BusinessDate | null;
  autoRenew: boolean;
}

/**
 * The day the IT Admin has to act by (`deadline`), the day the subscription enters the list of what ends soon (`point`) and the last day of
 * the period (`end`, what `EXPIRED` counts from: the renewal day, else the end day, never before the deadline).
 */
export interface AdjustmentPoint {
  kind: DeadlineKind;
  deadline: BusinessDate;
  point: BusinessDate;
  end: BusinessDate;
  endKind: DeadlineKind;
}

/**
 * Whether a subscription has a point of adjustment at all: one that runs a period (`QĐ-111o`). A purchase made once has none, a draft is not
 * operating and a period that a later one continues is not the one that runs. The one rule of the row of a list and of the filter by expiry:
 * `RUNS_A_PERIOD` of the repo says the same in SQL.
 */
export const runsAPeriod = (record: {
  kind: SubscriptionKind;
  status: SubscriptionStatus;
  hasSuccessor: boolean;
}): boolean => record.kind === 'TERM' && record.status === 'ACTIVE' && !record.hasSuccessor;

/**
 * Whether the plan of a subscription has a point of adjustment at all, whatever its dates: only a term of a workspace of the shared pool
 * (`K2`) of software that is not internal has one. The renewal answers the others `NOT_POOL_TERM` / `INTERNAL`, so a list gives them no alert dates
 * (`K1` has no point, `FR-1.12`(9)).
 */
export const hasAdjustmentPoint = (record: {
  planProvisioningType: ProvisioningType;
  applicationKind: ApplicationKind;
}): boolean => record.planProvisioningType === 'K2' && record.applicationKind !== 'INTERNAL';

/**
 * A plan by the month commits to one month, or names no commitment and is paid by the month (a personal plan, K1): the rest are plans by
 * the year, whose commitment is twelve months (`QĐ-103e`).
 */
function isByTheMonth(input: AdjustmentInput): boolean {
  return input.commitmentTermMonths === 1 || (input.commitmentTermMonths === null && input.billingCycle === 'MONTHLY');
}

/** The commitment a point of adjustment follows: a month or a year, by the same rule `adjustmentPointOf` picks its window with. */
export function adjustmentCommitmentOf(input: AdjustmentInput): 'MONTHLY' | 'ANNUAL' {
  return isByTheMonth(input) ? 'MONTHLY' : 'ANNUAL';
}

/**
 * The point of adjustment of the period a subscription runs in on `today` (`FR-1.4`, `QĐ-103e`, `QĐ-111o`): a plan by the month opens `windows.monthlyDays`
 * days (7 to begin with) before its next payment day whatever the deadline to cancel says: the payment day (the renewal day, else the end day) is rolled by whole
 * months, forward or back, to the first one that is not before today and is after the day the plan starts, since a plan by the month nobody adjusted goes on with the same seats (`QĐ-103e`,
 * `QĐ-103v`(5)); only a plan that does not renew itself and has an end day stops at that day, its period really ends there. A plan by the year opens `windows.annualDays`
 * days (30 to begin with) before the deadline to cancel (declared, or counted back from the renewal day by the days of notice) and runs to the renewal day (else the
 * end day); with no deadline and no days of notice, the same days before the renewal day when it renews itself (`QĐ-106i`) or before the end day when
 * it does not. A purchase made once has no period and so no point, and nothing is guessed: with no date to count from there is none. Pure.
 */
export function adjustmentPointOf(
  input: AdjustmentInput,
  today: BusinessDate,
  windows: AdjustmentWindows,
): AdjustmentPoint | null {
  const period = periodOf(input, today);
  if (period === null) return null;

  return {
    ...period,
    point: addDays(
      period.deadline,
      -(adjustmentCommitmentOf(input) === 'MONTHLY' ? windows.monthlyDays : windows.annualDays),
    ),
  };
}

/** What a point of adjustment is counted from, which no window changes: the deadline and the end of the period the subscription runs in on `today`. */
type PeriodOf = Omit<AdjustmentPoint, 'point'>;

function periodOf(input: AdjustmentInput, today: BusinessDate): PeriodOf | null {
  if (input.kind === 'PERPETUAL') return null;
  if (isByTheMonth(input)) return monthly(input, today);
  const notice = deriveNotice(input);
  if (notice.source === 'DECLARED' || notice.source === 'INFERRED_UNCONFIRMED') {
    return notice.deadline === null ? null : annual(input, 'NOTICE_DEADLINE', notice.deadline);
  }
  if (notice.source === 'BY_END_DATE') {
    return notice.baseDate === null ? null : annual(input, 'END_DATE', notice.baseDate);
  }
  // No deadline, no days of notice and a plan that renews itself: the renewal day is the deadline (`QĐ-106i`).
  return input.autoRenew && input.renewalDate !== null ? annual(input, 'RENEWAL_DATE', input.renewalDate) : null;
}

/** What the period of a subscription is read from, with the day it began and the day it was recorded when none was declared. */
export type PeriodStartInput = AdjustmentInput & { createdAt: Date };

/**
 * The instant the parameters of the period a subscription runs in on `today` are read at (`QĐ-106h`, R2-9): the start of the day the period began, so a
 * change of a parameter applies to the periods that begin after it and never moves one that runs. A plan by the year runs from its start day
 * (the record's day when none is declared); a plan by the month is one row that lives many months, so its period is the month that runs, from the
 * month before its next payment day, never before the plan starts. The start of a UTC day stands for the day of the organization: the two differ
 * by less than a day, which no setting can tell apart. The deadline does not depend on the windows, so it is counted first. Pure.
 */
export function adjustmentPeriodInstantOf(input: PeriodStartInput, today: BusinessDate): Date {
  const began = input.startDate ?? fromDateColumn(input.createdAt);
  if (!isByTheMonth(input)) return toDateColumn(began);
  const period = periodOf(input, today);
  if (period === null) return toDateColumn(began);
  const month = addMonths(period.deadline, -1);

  return toDateColumn(month > began ? month : began);
}

/**
 * A plan by the month: the next payment day, the first day of the monthly grid counted from the stored day (the renewal day, else the end day) that is not before
 * today and comes strictly after the day the plan starts (the day of a purchase is not a payment day to adjust: a new line that starts on a day of the grid pays a month later). The grid runs both ways from the stored day, so an end day months away does not hold the payment
 * day back (`QĐ-106i`(2), the same reading the mark of a period with no invoice makes of the payment day of a subscription), and a short month does not move the
 * day of the next. A plan that does not renew itself and ends on a day never passes it: no payment day comes after its end day.
 */
function monthly(input: AdjustmentInput, today: BusinessDate): PeriodOf | null {
  const stored = input.renewalDate ?? input.endDate;
  if (stored === null) return null;
  const from = input.startDate !== null && input.startDate >= today ? addDays(input.startDate, 1) : today;
  const next = addMonths(stored, firstGridOffsetFrom(stored, 1, from));
  const payment = !input.autoRenew && input.endDate !== null && input.endDate < next ? input.endDate : next;

  return {
    kind: 'PAYMENT_DATE',
    deadline: payment,
    end: payment,
    endKind: 'PAYMENT_DATE',
  };
}

function annual(input: AdjustmentInput, kind: DeadlineKind, deadline: BusinessDate): PeriodOf {
  const last: { day: BusinessDate; kind: DeadlineKind } | null =
    input.renewalDate !== null
      ? { day: input.renewalDate, kind: 'RENEWAL_DATE' }
      : input.endDate !== null
        ? { day: input.endDate, kind: 'END_DATE' }
        : null;
  const ends = last !== null && last.day >= deadline;

  return {
    kind,
    deadline,
    end: ends ? last.day : deadline,
    endKind: ends ? last.kind : kind,
  };
}

const DAY_MS = 86_400_000;

/** The whole days from `from` to `to`, negative when `to` is the earlier. */
const daysBetween = (from: BusinessDate, to: BusinessDate): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * Where a subscription stands against its period today: SOON from the day of the point to the last day of the period (a plan by the year
 * stays SOON after its deadline to cancel: the contract still runs), EXPIRED the day after the renewal day while seats are still held
 * (`QĐ-98e`: past the renewal day with the result not recorded; an end that nobody holds a seat under has nothing left to adjust), nothing
 * before the point. A plan by the month that goes on has no last day to pass (its point is rolled to the next payment day), so it is never
 * EXPIRED; only one that ends on a fixed day is. `daysLeft` counts to the deadline of the point and is negative once it is past; once the
 * period itself is over it counts from the renewal day (the end day), and `deadlineKind` says which. All null with no point. Pure.
 */
export function expiryReading(
  point: AdjustmentPoint | null,
  today: BusinessDate,
  holdsSeats: boolean,
): { state: ExpiryState | null; daysLeft: number | null; deadlineKind: DeadlineKind | null } {
  if (point === null) return { state: null, daysLeft: null, deadlineKind: null };
  if (today > point.end) {
    return {
      state: holdsSeats ? 'EXPIRED' : null,
      daysLeft: daysBetween(today, point.end),
      deadlineKind: point.endKind,
    };
  }

  return {
    state: today >= point.point ? 'SOON' : null,
    daysLeft: daysBetween(today, point.deadline),
    deadlineKind: point.kind,
  };
}

/**
 * Earliest date on which a seat reduction asked on `today` can take effect (`Q-F`, R-LATE): before or on an annual
 * cancellation deadline (or for any non-auto-renewing plan before it ends) it takes effect at the current period's end;
 * once an auto-renewing annual deadline has passed it rolls to the next cycle's end; a monthly plan rolls to its next
 * payment date. Null when no period exists or a non-renewing plan has already ended. Pure.
 */
export function earliestReducibleOn(input: AdjustmentInput, today: BusinessDate): BusinessDate | null {
  const period = periodOf(input, today);
  if (period === null) return null;
  if (!input.autoRenew && input.endDate !== null && today > input.endDate) return null;
  if (isByTheMonth(input)) return period.end;
  if (!input.autoRenew) return today > period.end ? null : period.end;
  if (today <= period.deadline) return period.end;

  return addMonths(period.end, input.commitmentTermMonths ?? 12);
}
