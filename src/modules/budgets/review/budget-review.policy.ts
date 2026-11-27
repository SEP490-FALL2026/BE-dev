import { monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import { nthWorkingDayFrom, type NonWorkingDates } from '../../../core/working-days';
import { roundHalfAway } from '../seat-month/seat-month.policy';
import type { PriceIncreaseItem, ReviewFigures, ReviewInput, ReviewKind, ReviewLight } from './budget-review.types';

/**
 * The rules of the review at the close of a month (`QĐ-111ae`, `QĐ-111af`, `QĐ-111ai`; R-5, R-37, R-47, R-52), as pure functions of figures in dong.
 * They are fixed numbers, not parameters (R-5, R-47): 110 % of the schedule, 70 % of the base from June, the fifth working day.
 */

/** Tests the pace against the schedule: above 110 % of it is yellow. */
const PACE_LIMIT_BASIS_POINTS = 11_000n;
/** From this month a forecast under 70 % of the base is a Cost Center that uses less than it asked for. */
const UNDER_FROM_MONTH = 6;
const UNDER_PERCENT = 70n;
const WORKING_DAY_OF_THE_CLOSE = 5;

/**
 * The difference k of the invoices of the commitments since the start of the year, in millionths (`QĐ-111ai`, `US-12-21`): what they cost over the price in the
 * commitment of the part they took down, less one. What they cost is the price on the invoice with the exchange rate and the card fee in it and the tax that
 * cannot be deducted (`QĐ-111an`, `QĐ-97d`); the price in the commitment is the part of it the invoices took down. With nothing taken down there is nothing to
 * measure the difference on, so it is 0.
 */
export function variancePpm(input: { invoiceBasisMinor: bigint; invoiceActualMinor: bigint }): bigint {
  if (input.invoiceBasisMinor <= 0n) return 0n;

  return roundHalfAway((input.invoiceActualMinor - input.invoiceBasisMinor) * 1_000_000n, input.invoiceBasisMinor);
}

/**
 * The forecast of the end of the year (`R-37`): what was spent (through the month and what was already recorded after it), plus what is held and what waits for the spend decision, multiplied by one plus k,
 * plus the price increase already known. What was spent is a real cost with its tax and fees already in it, so it is never multiplied again. The
 * multiplication is exact (the cost of the invoices over their price), rounded once, half away from zero.
 */
export function forecastOfYear(
  input: Pick<
    ReviewInput,
    | 'spentMinor'
    | 'spentAfterMonthMinor'
    | 'committedMinor'
    | 'pendingMinor'
    | 'invoiceBasisMinor'
    | 'invoiceActualMinor'
    | 'priceIncreaseMinor'
    | 'runningUncommittedMinor'
  >,
): bigint {
  const open = input.committedMinor + input.pendingMinor;
  const grownOpen =
    input.invoiceBasisMinor > 0n ? roundHalfAway(open * input.invoiceActualMinor, input.invoiceBasisMinor) : open;

  return (
    input.spentMinor +
    input.spentAfterMonthMinor +
    grownOpen +
    input.priceIncreaseMinor +
    (input.runningUncommittedMinor ?? 0n)
  );
}

/**
 * The price increase already known (`R-52`, `US-12-21` AC-7): for each commitment, what a seat costs in each month after the one closed over what it was committed
 * at, for the seat-months the commitment still holds, which are its first months in order (a month takes at most its seats). Only what rose: a month at a lower price
 * adds nothing and is never taken off. The seat-months are not rounded up to a whole month: 20 tr held at 1,5 tr a seat-month are 13,33 of them. Rounded once for a
 * commitment, half away from zero.
 */
export function knownPriceIncrease(items: readonly PriceIncreaseItem[]): bigint {
  let total = 0n;
  for (const item of items) {
    if (item.seats <= 0 || item.committedMonthlyMinor <= 0n || item.heldMinor <= 0n) continue;
    const monthMinor = BigInt(item.seats) * item.committedMonthlyMinor;
    let left = item.heldMinor;
    let weighted = 0n;
    for (const current of item.monthlyMinor) {
      const covered = left < monthMinor ? left : monthMinor;
      if (covered <= 0n) break;
      if (current > item.committedMonthlyMinor) weighted += (current - item.committedMonthlyMinor) * covered;
      left -= covered;
    }
    total += roundHalfAway(weighted, item.committedMonthlyMinor);
  }

  return total;
}

/**
 * The pace of spending: what was spent over what an even schedule would have spent by the end of month `month` (the base times month over twelve),
 * in hundredths of a percent, rounded up so that "above 110 %" is exactly "above 11.000". Null with no base: there is no schedule.
 */
export function paceOf(input: { spentMinor: bigint; baseMinor: bigint; month: number }): bigint | null {
  if (input.baseMinor <= 0n) return null;
  const scheduled = input.baseMinor * BigInt(input.month);
  const numerator = input.spentMinor * 12n * 10_000n;

  return (numerator + scheduled - 1n) / scheduled;
}

/**
 * The light (`QĐ-111af`), in this order: red when the forecast is above the base and the reserve; yellow when it is above the base or the pace is
 * above 110 %; under from June when the forecast is under 70 % of the base; green otherwise.
 */
export function lightOf(input: {
  month: number;
  baseMinor: bigint;
  reserveMinor: bigint;
  forecastMinor: bigint;
  paceBasisPoints: bigint | null;
}): ReviewLight {
  if (input.forecastMinor > input.baseMinor + input.reserveMinor) return 'RED';
  if (
    input.forecastMinor > input.baseMinor ||
    (input.paceBasisPoints !== null && input.paceBasisPoints > PACE_LIMIT_BASIS_POINTS)
  ) {
    return 'YELLOW';
  }
  if (input.month >= UNDER_FROM_MONTH && input.forecastMinor * 100n < UNDER_PERCENT * input.baseMinor) return 'UNDER';

  return 'GREEN';
}

/** Everything the snapshot of a Cost Center keeps of the close of a month, worked out in one place. */
export function reviewFiguresOf(input: ReviewInput): ReviewFigures {
  const forecastMinor = forecastOfYear(input);
  const paceBasisPoints = paceOf(input);

  return {
    remainingMinor:
      input.baseMinor +
      input.reserveMinor -
      input.spentMinor -
      input.spentAfterMonthMinor -
      input.committedMinor -
      input.pendingMinor,
    variancePpm: variancePpm(input),
    forecastMinor,
    paceBasisPoints,
    light: lightOf({ ...input, forecastMinor, paceBasisPoints }),
  };
}

/** March, June and September are the quarterly review (`QĐ-111ae`); the other months only close the month. */
export function reviewKindOf(month: number): ReviewKind {
  return month === 3 || month === 6 || month === 9 ? 'QUARTER' : 'MONTH';
}

/** Whether the month has ended on `today`: a month is closed from the day after its last day. */
export function reviewedMonthHasEnded(year: number, month: number, today: BusinessDate): boolean {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;

  return today >= monthBoundsOf(first).nextStart;
}

/**
 * The month Finance is asked to close on `today` (`R-47`): on the fifth working day of a month, the month before it. On any other day there is nothing
 * to ask; whether the month was closed already is for the service to say.
 */
export function reviewReminderFor(
  today: BusinessDate,
  nonWorkingDates: NonWorkingDates,
): { year: number; month: number } | null {
  const first = `${today.slice(0, 7)}-01`;
  if (nthWorkingDayFrom(first, WORKING_DAY_OF_THE_CLOSE, nonWorkingDates) !== today) return null;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/**
 * Whether the line "not allocated, shared pool" of the year is above the reserve of the shared pool of the budget cycle (`QĐ-104i`, `MG-03`): Finance is warned
 * when it is. Null when the cycle has no reserve: there is nothing to set the line against.
 */
export function sharedPoolOverReserve(unallocatedMinor: bigint, reserveMinor: bigint | null): boolean | null {
  return reserveMinor === null ? null : unallocatedMinor > reserveMinor;
}
