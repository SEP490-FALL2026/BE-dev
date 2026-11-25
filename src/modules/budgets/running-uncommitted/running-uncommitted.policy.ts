import { addDays, type BusinessDate } from '../../../core/business-date';

/** A seat of a K2 pool subscription in force on `today`, mapped to its current Cost Center. */
export interface RunningUncommittedSeat {
  assignmentId: string;
  subscriptionId: string;
  requestId: string | null;
  source: 'BASELINE' | 'HANDOVER' | 'REQUEST' | 'RENEWAL_CARRY' | 'MACHINE_ACCOUNT_CONVERSION';
  costCenterId: string | null;
  heldFrom: BusinessDate;
  heldUntil: BusinessDate | null;
}

/** Active K2 subscription period pricing and start date. */
export interface RunningUncommittedPeriod {
  monthlyPriceMinor: bigint | null;
  startDate: BusinessDate | null;
}

/** Year commitment state and Cost Center of a request. */
export interface RunningUncommittedCommitment {
  state: 'HELD' | 'RELEASED' | 'EXPENSED';
  costCenterId: string;
}

export interface RunningUncommittedInput {
  year: number;
  today: BusinessDate;
  seats: readonly RunningUncommittedSeat[];
  periodBySubscription: ReadonlyMap<string, RunningUncommittedPeriod>;
  commitmentByRequest: ReadonlyMap<string, RunningUncommittedCommitment>;
  runMonthsBySubscription: ReadonlyMap<string, ReadonlySet<number>>;
}

const EMPTY_MONTHS: ReadonlySet<number> = new Set();

const maxDate = (a: BusinessDate, b: BusinessDate): BusinessDate => (a >= b ? a : b);

/** True when a seat has no HELD commitment on the holder's current Cost Center for the year. */
function isUncommittedSeat(
  seat: RunningUncommittedSeat,
  commitmentByRequest: ReadonlyMap<string, RunningUncommittedCommitment>,
): boolean {
  if (seat.requestId === null) return true;
  const commitment = commitmentByRequest.get(seat.requestId);
  if (!commitment) return true;

  return commitment.state !== 'HELD' || commitment.costCenterId !== seat.costCenterId;
}

/**
 * Counts calendar months in `year` from when the seat starts being held in `year` (on its period)
 * up to the month of its last held day (`heldUntil - 1`, or month 12 when open) that lack a `seat_month_runs` row.
 */
function seatMonthsLeft(
  year: number,
  seat: RunningUncommittedSeat,
  periodStartDate: BusinessDate | null,
  runMonths: ReadonlySet<number>,
): number {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const effectiveStart = maxDate(seat.heldFrom, maxDate(periodStartDate ?? seat.heldFrom, yearStart));
  if (effectiveStart > yearEnd) return 0;

  // `heldUntil` is exclusive (the first day the seat is no longer held), so the last held day is `heldUntil - 1`.
  const lastHeldDay = seat.heldUntil === null ? yearEnd : addDays(seat.heldUntil, -1);
  if (lastHeldDay < effectiveStart) return 0;

  const clampedEnd = lastHeldDay > yearEnd ? yearEnd : lastHeldDay;
  const fromMonth = Number(effectiveStart.slice(5, 7));
  const toMonth = Number(clampedEnd.slice(5, 7));

  let monthsLeft = 0;
  for (let month = fromMonth; month <= toMonth; month += 1) {
    if (!runMonths.has(month)) monthsLeft += 1;
  }

  return monthsLeft;
}

function seatUncommittedCost(seat: RunningUncommittedSeat, input: RunningUncommittedInput): bigint {
  if (seat.costCenterId === null) return 0n;
  if (seat.heldFrom > input.today || (seat.heldUntil !== null && input.today >= seat.heldUntil)) return 0n;
  if (!isUncommittedSeat(seat, input.commitmentByRequest)) return 0n;

  const period = input.periodBySubscription.get(seat.subscriptionId);
  if (!period || period.monthlyPriceMinor === null || period.monthlyPriceMinor <= 0n) return 0n;

  const runMonths = input.runMonthsBySubscription.get(seat.subscriptionId) ?? EMPTY_MONTHS;
  const monthsLeft = seatMonthsLeft(input.year, seat, period.startDate, runMonths);
  return monthsLeft > 0 ? period.monthlyPriceMinor * BigInt(monthsLeft) : 0n;
}

/**
 * Computes running uncommitted K2 pool cost per Cost Center for `year` on `today`.
 * Applies to the current fiscal year and next year (`Y+1`); past years and further future years return empty totals.
 */
export function runningUncommittedByCostCenter(input: RunningUncommittedInput): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  const todayYear = Number(input.today.slice(0, 4));
  if (input.year !== todayYear && input.year !== todayYear + 1) return totals;

  for (const seat of input.seats) {
    if (seat.costCenterId === null) continue;
    const cost = seatUncommittedCost(seat, input);
    if (cost > 0n) totals.set(seat.costCenterId, (totals.get(seat.costCenterId) ?? 0n) + cost);
  }

  return totals;
}
