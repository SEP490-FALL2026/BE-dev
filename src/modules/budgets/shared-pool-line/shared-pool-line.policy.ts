import { addDays, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import { roundHalfAway } from '../../../core/seat-month-cost';

export type PoolLineFlag = 'NO_PRICE' | 'NO_QUANTITY';

export interface PoolPeriodSpec {
  subscriptionId: string;
  purchasedQuantity: number | null;
  monthlyPriceMinor: bigint | null;
  startDate: BusinessDate | null;
  endExclusive: BusinessDate | null;
  /** Optional per-day seat counts from the line ledger; falls back to `purchasedQuantity` when absent. */
  dailySeats?: ReadonlyMap<BusinessDate, number | null>;
}

export interface HeldSeatInterval {
  heldFrom: BusinessDate;
  heldUntil: BusinessDate | null;
}

export interface PoolPeriodMonthCost {
  paidMinor: bigint | null;
  idleCostMinor: bigint | null;
  paidSeatDays: bigint;
  heldSeatDays: bigint;
  idleSeatDays: bigint;
  daysInMonth: number;
  daysPaid: number;
  flags: PoolLineFlag[];
}

const DAY_MS = 86_400_000;

/** Whole calendar days between `from` (inclusive) and `to` (exclusive), clamped at 0. */
export function calendarDays(from: BusinessDate, to: BusinessDate): number {
  if (to <= from) return 0;

  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Days in `month` during which the purchase period `[startDate, endExclusive)` was paid.
 * Unbounded ends fall to the month boundaries. Pure.
 */
export function daysPaidOf(
  startDate: BusinessDate | null,
  endExclusive: BusinessDate | null,
  month: BusinessDate,
): number {
  const { start, nextStart } = monthBoundsOf(month);
  const from = startDate !== null && startDate > start ? startDate : start;
  const until = endExclusive !== null && endExclusive < nextStart ? endExclusive : nextStart;

  return calendarDays(from, until);
}

/**
 * Total seat-days held on a period within `month`, counting all active days regardless of whether the holder had a
 * department placement (: a held seat without a placement is still held, not idle). When a period window is
 * provided, clamps each seat interval to the paid period bounds so days outside the period never offset days inside it. Pure.
 */
export function heldSeatDaysOf(
  seats: readonly HeldSeatInterval[],
  month: BusinessDate,
  periodWindow?: { startDate: BusinessDate | null; endExclusive: BusinessDate | null },
): bigint {
  const { start, nextStart } = monthBoundsOf(month);
  const windowStart =
    periodWindow?.startDate != null && periodWindow.startDate > start ? periodWindow.startDate : start;
  const windowEnd =
    periodWindow?.endExclusive != null && periodWindow.endExclusive < nextStart ? periodWindow.endExclusive : nextStart;
  if (windowEnd <= windowStart) return 0n;

  let total = 0;
  for (const seat of seats) {
    const from = seat.heldFrom > windowStart ? seat.heldFrom : windowStart;
    const until = seat.heldUntil !== null && seat.heldUntil < windowEnd ? seat.heldUntil : windowEnd;
    total += calendarDays(from, until);
  }

  return BigInt(total);
}

/** Number of days in the calendar month containing `month`. */
export function daysInCalendarMonth(month: BusinessDate): number {
  const { start, nextStart } = monthBoundsOf(month);

  return calendarDays(start, nextStart);
}

/**
 * Days of `month` enumerated in ascending `YYYY-MM-DD` order within `[from, until)`.
 */
export function activeMonthDates(
  month: BusinessDate,
  startDate: BusinessDate | null,
  endExclusive: BusinessDate | null,
): BusinessDate[] {
  const { start, nextStart } = monthBoundsOf(month);
  const from = startDate !== null && startDate > start ? startDate : start;
  const until = endExclusive !== null && endExclusive < nextStart ? endExclusive : nextStart;
  const count = calendarDays(from, until);
  const dates: BusinessDate[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    dates.push(addDays(from, offset));
  }

  return dates;
}

function resolvePaidSeatDays(
  period: PoolPeriodSpec,
  activeDates: readonly BusinessDate[],
): { paidSeatDays: bigint; missingQuantity: boolean } {
  if (activeDates.length === 0) {
    return { paidSeatDays: 0n, missingQuantity: period.purchasedQuantity === null && period.dailySeats === undefined };
  }
  let paidSeatDays = 0n;
  for (const day of activeDates) {
    const qty = period.dailySeats ? (period.dailySeats.get(day) ?? period.purchasedQuantity) : period.purchasedQuantity;
    if (qty === null) return { paidSeatDays: 0n, missingQuantity: true };
    paidSeatDays += BigInt(qty);
  }

  return { paidSeatDays, missingQuantity: false };
}

/**
 * Paid seat cost, held seat-days, idle seat cost and data-quality flags for one pool period or line in one month.
 * Uses round-half-away-from-zero (`roundHalfAway`) and clamps negative idle seat-days at `0n`. Pure.
 */
export function poolPeriodMonthCost(
  period: PoolPeriodSpec,
  seats: readonly HeldSeatInterval[],
  month: BusinessDate,
): PoolPeriodMonthCost {
  const daysInMonth = daysInCalendarMonth(month);
  const activeDates = activeMonthDates(month, period.startDate, period.endExclusive);
  const daysPaid = activeDates.length;
  const heldSeatDays = heldSeatDaysOf(seats, month, period);
  const { paidSeatDays, missingQuantity } = resolvePaidSeatDays(period, activeDates);
  const flags: PoolLineFlag[] = [];
  if (period.monthlyPriceMinor === null) flags.push('NO_PRICE');
  if (missingQuantity) flags.push('NO_QUANTITY');

  if (flags.length > 0) {
    return {
      paidMinor: null,
      idleCostMinor: null,
      paidSeatDays: 0n,
      heldSeatDays,
      idleSeatDays: 0n,
      daysInMonth,
      daysPaid,
      flags,
    };
  }

  const monthly = period.monthlyPriceMinor as bigint;
  const idleSeatDays = paidSeatDays > heldSeatDays ? paidSeatDays - heldSeatDays : 0n;

  return {
    paidMinor: roundHalfAway(paidSeatDays * monthly, BigInt(daysInMonth)),
    idleCostMinor: roundHalfAway(idleSeatDays * monthly, BigInt(daysInMonth)),
    paidSeatDays,
    heldSeatDays,
    idleSeatDays,
    daysInMonth,
    daysPaid,
    flags,
  };
}

/** Whether a subscription record belongs in the shared-pool lines of a month (`K2` `TERM` active with seats or runs). */
export function isEligiblePoolPeriod(record: {
  status: 'DRAFT' | 'ACTIVE';
  kind: 'TERM' | 'PERPETUAL';
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  hasSeatOrRun: boolean;
}): boolean {
  return (
    record.status === 'ACTIVE' && record.kind === 'TERM' && record.provisioningType === 'K2' && record.hasSeatOrRun
  );
}

/**
 * Net shared-pool `unallocated` line of one subscription-month: idle seat cost (0n when price or quantity is missing)
 * plus invoice variances, device-lot purchases and replacement keys. Pure.
 */
export function unallocatedMinorOf(input: {
  idleCostMinor: bigint | null;
  invoicedMinor?: bigint;
  allocatedMinor?: bigint;
  invoiceVarianceMinor?: bigint;
  invoiceVarianceInReviewMinor?: bigint;
  deviceLotPurchasesMinor?: bigint;
  replacementKeysMinor?: bigint;
}): bigint {
  return (
    (input.idleCostMinor ?? 0n) +
    (input.invoiceVarianceMinor ?? 0n) +
    (input.invoiceVarianceInReviewMinor ?? 0n) +
    (input.deviceLotPurchasesMinor ?? 0n) +
    (input.replacementKeysMinor ?? 0n)
  );
}

/** Whether cumulative shared-pool spend exceeds the configured reserve strictly (`>`). Null when no reserve is set. */
export function isPoolOverReserve(totalMinor: bigint, reserveMinor: bigint | null): boolean | null {
  return reserveMinor === null ? null : totalMinor > reserveMinor;
}
