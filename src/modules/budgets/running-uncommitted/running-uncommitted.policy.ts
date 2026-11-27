import { addDays, type BusinessDate } from '../../../core/business-date';

/** A seat of a K2 pool subscription in force on `today`, mapped to its current Cost Center. */
export interface RunningUncommittedSeat {
  assignmentId: string;
  subscriptionId: string;
  /** The plan of the seat: the line of the period that serves this plan prices it. */
  planId: string;
  requestId: string | null;
  source: 'BASELINE' | 'HANDOVER' | 'REQUEST' | 'RENEWAL_CARRY' | 'MACHINE_ACCOUNT_CONVERSION';
  costCenterId: string | null;
  heldFrom: BusinessDate;
  heldUntil: BusinessDate | null;
}

/** The key of the period a seat is priced on: the subscription and the plan of the seat (a period with lines has a price for each plan). */
export const periodKeyOf = (subscriptionId: string, planId: string): string => `${subscriptionId}:${planId}`;

/** Active K2 subscription period start date and the monthly price of a seat of one plan on it. */
export interface RunningUncommittedPeriod {
  monthlyPriceMinor: bigint | null;
  startDate: BusinessDate | null;
}

/** Year commitment state and Cost Center of a request. */
export interface RunningUncommittedCommitment {
  state: 'HELD' | 'RELEASED' | 'EXPENSED';
  costCenterId: string;
}

/** An active K1 seat without a Request (`K-A2`). */
export interface RunningUncommittedK1Seat {
  assignmentId: string;
  planId: string;
  costCenterId: string | null;
  heldFrom: BusinessDate;
  heldUntil: BusinessDate | null;
  billingAnchorOn?: BusinessDate | null;
}

export interface RunningUncommittedFlag {
  code: 'NO_PRICE';
  planId: string;
  assignmentId: string;
}

export interface RunningUncommittedResult {
  totals: Map<string, bigint>;
  flagsByCostCenter: Map<string, RunningUncommittedFlag[]>;
}

export interface RunningUncommittedInput {
  year: number;
  today: BusinessDate;
  seats: readonly RunningUncommittedSeat[];
  /** The period each seat is priced on, by `periodKeyOf(subscriptionId, planId)`. */
  periodBySubscriptionPlan: ReadonlyMap<string, RunningUncommittedPeriod>;
  commitmentByRequest: ReadonlyMap<string, RunningUncommittedCommitment>;
  runMonthsBySubscription: ReadonlyMap<string, ReadonlySet<number>>;
  k1UnrequestedSeats?: readonly RunningUncommittedK1Seat[];
  k1ReferencePriceByPlan?: ReadonlyMap<string, bigint | null>;
  exceptRequestIds?: ReadonlySet<string>;
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

const isInForceOn = (seat: { heldFrom: BusinessDate; heldUntil: BusinessDate | null }, today: BusinessDate): boolean =>
  seat.heldFrom <= today && (seat.heldUntil === null || today < seat.heldUntil);

function seatUncommittedCost(seat: RunningUncommittedSeat, input: RunningUncommittedInput): bigint {
  if (seat.costCenterId === null || !isInForceOn(seat, input.today)) return 0n;
  if (seat.requestId !== null && input.exceptRequestIds?.has(seat.requestId)) return 0n;
  if (!isUncommittedSeat(seat, input.commitmentByRequest)) return 0n;

  const period = input.periodBySubscriptionPlan.get(periodKeyOf(seat.subscriptionId, seat.planId));
  if (!period || period.monthlyPriceMinor === null || period.monthlyPriceMinor <= 0n) return 0n;

  const runMonths = input.runMonthsBySubscription.get(seat.subscriptionId) ?? EMPTY_MONTHS;
  const monthsLeft = seatMonthsLeft(input.year, seat, period.startDate, runMonths);
  return monthsLeft > 0 ? period.monthlyPriceMinor * BigInt(monthsLeft) : 0n;
}

/**
 * Computes running uncommitted K2 pool and unrequested K1 cost per Cost Center for `year` on `today` with `NO_PRICE` flags.
 * Applies to the current fiscal year and next year (`Y+1`); past years and further future years return empty totals.
 */
export function runningUncommittedWithFlagsByCostCenter(input: RunningUncommittedInput): RunningUncommittedResult {
  const totals = new Map<string, bigint>();
  const flagsByCostCenter = new Map<string, RunningUncommittedFlag[]>();
  const todayYear = Number(input.today.slice(0, 4));
  if (input.year !== todayYear && input.year !== todayYear + 1) return { totals, flagsByCostCenter };

  for (const seat of input.seats) {
    if (seat.costCenterId === null) continue;
    const cost = seatUncommittedCost(seat, input);
    if (cost > 0n) totals.set(seat.costCenterId, (totals.get(seat.costCenterId) ?? 0n) + cost);
  }
  accumulateK1Unrequested(input, totals, flagsByCostCenter);

  return { totals, flagsByCostCenter };
}

/**
 * Computes running uncommitted cost per Cost Center for `year` on `today`.
 */
export function runningUncommittedByCostCenter(input: RunningUncommittedInput): Map<string, bigint> {
  return runningUncommittedWithFlagsByCostCenter(input).totals;
}

function k1MonthsLeftInYear(
  seat: RunningUncommittedK1Seat,
  today: BusinessDate,
  minMonthDay: BusinessDate,
  yearEnd: BusinessDate,
): number {
  if (seat.heldFrom > today || (seat.heldUntil !== null && today >= seat.heldUntil)) return 0;
  const effectiveStart = maxDate(seat.heldFrom, minMonthDay);
  if (effectiveStart > yearEnd) return 0;
  const lastHeldDay = seat.heldUntil === null ? yearEnd : addDays(seat.heldUntil, -1);
  if (lastHeldDay < effectiveStart) return 0;
  const clampedEnd = lastHeldDay > yearEnd ? yearEnd : lastHeldDay;
  const months = Number(clampedEnd.slice(5, 7)) - Number(effectiveStart.slice(5, 7)) + 1;

  return months > 0 ? months : 0;
}

function accumulateK1Unrequested(
  input: RunningUncommittedInput,
  totals: Map<string, bigint>,
  flagsByCostCenter: Map<string, RunningUncommittedFlag[]>,
): void {
  const priceMap = input.k1ReferencePriceByPlan ?? new Map<string, bigint | null>();
  const todayYear = Number(input.today.slice(0, 4));
  const yearStart: BusinessDate = `${input.year}-01-01`;
  const yearEnd: BusinessDate = `${input.year}-12-31`;
  const minMonthDay = input.year === todayYear ? maxDate(yearStart, `${input.today.slice(0, 7)}-01`) : yearStart;

  for (const seat of input.k1UnrequestedSeats ?? []) {
    if (seat.costCenterId === null) continue;
    const months = k1MonthsLeftInYear(seat, input.today, minMonthDay, yearEnd);
    if (months === 0) continue;

    const refPrice = priceMap.get(seat.planId) ?? null;
    if (refPrice === null || refPrice <= 0n) {
      const list = flagsByCostCenter.get(seat.costCenterId) ?? [];
      list.push({ code: 'NO_PRICE', planId: seat.planId, assignmentId: seat.assignmentId });
      flagsByCostCenter.set(seat.costCenterId, list);
      continue;
    }

    totals.set(seat.costCenterId, (totals.get(seat.costCenterId) ?? 0n) + refPrice * BigInt(months));
  }
}
