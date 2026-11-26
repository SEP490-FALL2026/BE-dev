import type { BusinessDate } from '../../../core/business-date';
import { roundHalfAway } from '../../../core/seat-month-cost';
import {
  adjustmentCommitmentOf,
  adjustmentPointOf,
  earliestReducibleOn,
  type AdjustmentInput,
  type AdjustmentWindows,
} from '../../catalog/public/subscription-obligation.policy';
import { activeMonthDates, poolPeriodMonthCost, type HeldSeatInterval } from './shared-pool-line.policy';

export interface LabelClassificationInput extends AdjustmentInput {
  subscriptionId: string;
  purchasedQuantity: number | null;
  monthlyPriceMinor: bigint | null;
  startDate: BusinessDate | null;
  endExclusive: BusinessDate | null;
  vendorMinimumSeats: number | null;
  /** Purchased quantity recorded for the following period, if already confirmed; defaults to `purchasedQuantity`. */
  qNext: number | null;
  windows: AdjustmentWindows;
  /** Optional per-day seat counts from the line ledger; falls back to `purchasedQuantity`. */
  dailySeats?: ReadonlyMap<BusinessDate, number | null>;
  /** Missed-adjustment seats carried from the prior period (`0` for `MEMBERS` or when target met). */
  missedSeats?: number;
}

export interface IdleCostByLabel {
  missedAdjustmentMinor: bigint;
  reducibleMinor: bigint;
  lockedUntil: Record<BusinessDate, bigint>;
}

export interface IdleCostClassification {
  idleCostMinor: bigint | null;
  paidMinor: bigint | null;
  byLabel: IdleCostByLabel;
  idleAtMinimumCostMinor: bigint;
  excessIdleCostMinor: bigint;
  excessIdleSeatDays: bigint;
  paidSeatDays: bigint;
  ratioPercent: string;
  exceedsIdleRatioThreshold: boolean;
}

interface Segment {
  kind: 'MISSED_ADJUSTMENT' | 'REDUCIBLE' | 'LOCKED_UNTIL';
  until: BusinessDate | null;
  seatDays: number;
}

function emptyResult(idleCostMinor: bigint | null, paidMinor: bigint | null): IdleCostClassification {
  return {
    idleCostMinor,
    paidMinor,
    byLabel: { missedAdjustmentMinor: 0n, reducibleMinor: 0n, lockedUntil: {} },
    idleAtMinimumCostMinor: 0n,
    excessIdleCostMinor: 0n,
    excessIdleSeatDays: 0n,
    paidSeatDays: 0n,
    ratioPercent: '0.00',
    exceedsIdleRatioThreshold: false,
  };
}

function pushSegment(segments: Segment[], kind: Segment['kind'], until: BusinessDate | null, seatDays: number): void {
  if (seatDays <= 0) return;
  const existing = segments.find((s) => s.kind === kind && s.until === until);
  if (existing) {
    existing.seatDays += seatDays;
    return;
  }
  segments.push({ kind, until, seatDays });
}

function countHeldOnDay(seats: readonly HeldSeatInterval[], day: BusinessDate): number {
  let count = 0;
  for (const seat of seats) {
    if (seat.heldFrom <= day && (seat.heldUntil === null || day < seat.heldUntil)) {
      count += 1;
    }
  }

  return count;
}

function formatRatioPercent(numerator: bigint, denominator: bigint): string {
  if (denominator <= 0n || numerator <= 0n) return '0.00';
  const bps = roundHalfAway(numerator * 10_000n, denominator);
  const whole = bps / 100n;
  const frac = (bps % 100n).toString().padStart(2, '0');

  return `${whole.toString()}.${frac}`;
}

function classifyDay(
  input: LabelClassificationInput,
  day: BusinessDate,
  idleCount: number,
  seatsToday: number,
  segments: Segment[],
): void {
  const point = adjustmentPointOf(input, day, input.windows);
  if (point === null) {
    pushSegment(segments, 'REDUCIBLE', null, idleCount);
    return;
  }
  if (day >= point.point && day <= point.deadline) {
    pushSegment(segments, 'REDUCIBLE', null, idleCount);
    return;
  }
  const commitment = adjustmentCommitmentOf(input);
  if (commitment === 'ANNUAL' && day > point.deadline) {
    const qNext = input.qNext ?? seatsToday;
    const reducedShare = Math.max(0, Math.min(idleCount, seatsToday - qNext));
    const keptShare = idleCount - reducedShare;
    pushSegment(segments, 'LOCKED_UNTIL', point.end, reducedShare);
    pushSegment(segments, 'LOCKED_UNTIL', earliestReducibleOn(input, day) ?? point.end, keptShare);
    return;
  }

  pushSegment(segments, 'LOCKED_UNTIL', point.end, idleCount);
}

function collectIdleSegments(
  input: LabelClassificationInput,
  seats: readonly HeldSeatInterval[],
  month: BusinessDate,
): { segments: Segment[]; idleAtMinSeatDays: number } {
  const missedCap = Math.max(0, input.missedSeats ?? 0);
  const segments: Segment[] = [];
  let idleAtMinSeatDays = 0;

  for (const day of activeMonthDates(month, input.startDate, input.endExclusive)) {
    const seatsToday =
      (input.dailySeats ? input.dailySeats.get(day) : input.purchasedQuantity) ?? input.purchasedQuantity;
    if (seatsToday === null) continue;
    const minFloor = Math.min(input.vendorMinimumSeats ?? 0, seatsToday);
    const heldToday = countHeldOnDay(seats, day);
    idleAtMinSeatDays += Math.max(0, minFloor - heldToday);
    const idleToday = Math.max(0, seatsToday - heldToday);
    if (idleToday <= 0) continue;

    const missedToday = Math.min(idleToday, missedCap);
    if (missedToday > 0) pushSegment(segments, 'MISSED_ADJUSTMENT', null, missedToday);
    const remainingIdle = idleToday - missedToday;
    if (remainingIdle > 0) classifyDay(input, day, remainingIdle, seatsToday, segments);
  }

  return { segments, idleAtMinSeatDays };
}

/**
 * Splits a period's or line's monthly idle seat cost into adjustment-window buckets (+ label `(1)` winning
 * over `(2)`/`(3)` + Q-F R-LATE split) with remainder assigned to the final segment so bucket totals sum exactly to `idleCostMinor`,
 * and computes the 10% excess-idle alert check excluding vendor minimum seat commitments. Pure.
 */
export function classifyIdleSeatCosts(
  input: LabelClassificationInput,
  seats: readonly HeldSeatInterval[],
  month: BusinessDate,
): IdleCostClassification {
  const cost = poolPeriodMonthCost(input, seats, month);
  if (cost.idleCostMinor === null || cost.paidMinor === null || cost.idleCostMinor === 0n || cost.paidMinor === 0n) {
    return emptyResult(cost.idleCostMinor, cost.paidMinor);
  }

  const monthly = input.monthlyPriceMinor as bigint;
  const { segments, idleAtMinSeatDays } = collectIdleSegments(input, seats, month);
  const byLabel = allocateSegments(segments, cost.idleCostMinor, monthly, cost.daysInMonth);
  const rawMinCost = roundHalfAway(BigInt(idleAtMinSeatDays) * monthly, BigInt(cost.daysInMonth));
  const idleAtMinimumCostMinor = rawMinCost > cost.idleCostMinor ? cost.idleCostMinor : rawMinCost;
  const excessIdleCostMinor = cost.idleCostMinor - idleAtMinimumCostMinor;
  const excessIdleSeatDays =
    cost.idleSeatDays > BigInt(idleAtMinSeatDays) ? cost.idleSeatDays - BigInt(idleAtMinSeatDays) : 0n;

  return {
    idleCostMinor: cost.idleCostMinor,
    paidMinor: cost.paidMinor,
    byLabel,
    idleAtMinimumCostMinor,
    excessIdleCostMinor,
    excessIdleSeatDays,
    paidSeatDays: cost.paidSeatDays,
    ratioPercent: formatRatioPercent(excessIdleCostMinor, cost.paidMinor),
    exceedsIdleRatioThreshold: excessIdleSeatDays * 10n > cost.paidSeatDays,
  };
}

function allocateSegments(
  segments: readonly Segment[],
  idleCostMinor: bigint,
  monthly: bigint,
  daysInMonth: number,
): IdleCostByLabel {
  const byLabel: IdleCostByLabel = { missedAdjustmentMinor: 0n, reducibleMinor: 0n, lockedUntil: {} };
  let allocated = 0n;
  segments.forEach((seg, index) => {
    const amount =
      index === segments.length - 1
        ? idleCostMinor > allocated
          ? idleCostMinor - allocated
          : 0n
        : roundHalfAway(BigInt(seg.seatDays) * monthly, BigInt(daysInMonth));
    allocated += amount;
    if (seg.kind === 'MISSED_ADJUSTMENT') {
      byLabel.missedAdjustmentMinor += amount;
    } else if (seg.kind === 'REDUCIBLE') {
      byLabel.reducibleMinor += amount;
    } else if (seg.until !== null) {
      byLabel.lockedUntil[seg.until] = (byLabel.lockedUntil[seg.until] ?? 0n) + amount;
    }
  });

  return byLabel;
}

/**
 * Resolves `missed(L) = max(0, seats(L, startDate) - lockedTargetOfPriorLine)` for `FIXED` subscriptions;
 * `MEMBERS` subscriptions always yield `0`.
 */
export function resolveLineMissedSeats(input: {
  seatCounting: 'FIXED' | 'MEMBERS';
  seatsAtPeriodStart: number | null;
  priorLineId: string | null;
  periodStartDate: BusinessDate | null;
  priorTargets: ReadonlyArray<{ subscriptionLineId: string; renewalOn: BusinessDate; target: number }>;
}): number {
  if (input.seatCounting !== 'FIXED' || input.seatsAtPeriodStart === null) return 0;
  if (input.priorLineId === null || input.periodStartDate === null) return 0;
  let best: { renewalOn: BusinessDate; target: number } | null = null;
  for (const row of input.priorTargets) {
    if (row.subscriptionLineId !== input.priorLineId || row.renewalOn > input.periodStartDate) continue;
    if (best === null || row.renewalOn > best.renewalOn) best = row;
  }
  if (!best) return 0;

  return Math.max(0, input.seatsAtPeriodStart - best.target);
}

/** Aggregates per-line idle classifications within one subscription period. */
export function aggregateIdleClassifications(items: readonly IdleCostClassification[]): IdleCostClassification {
  if (items.length === 1) return items[0];
  let idleCostMinor: bigint | null = 0n;
  let paidMinor: bigint | null = 0n;
  let idleAtMinimumCostMinor = 0n;
  let excessIdleCostMinor = 0n;
  let excessIdleSeatDays = 0n;
  let paidSeatDays = 0n;
  const byLabel: IdleCostByLabel = { missedAdjustmentMinor: 0n, reducibleMinor: 0n, lockedUntil: {} };

  for (const item of items) {
    idleCostMinor = idleCostMinor === null || item.idleCostMinor === null ? null : idleCostMinor + item.idleCostMinor;
    paidMinor = paidMinor === null || item.paidMinor === null ? null : paidMinor + item.paidMinor;
    idleAtMinimumCostMinor += item.idleAtMinimumCostMinor;
    excessIdleCostMinor += item.excessIdleCostMinor;
    excessIdleSeatDays += item.excessIdleSeatDays;
    paidSeatDays += item.paidSeatDays;
    byLabel.missedAdjustmentMinor += item.byLabel.missedAdjustmentMinor;
    byLabel.reducibleMinor += item.byLabel.reducibleMinor;
    for (const [date, minor] of Object.entries(item.byLabel.lockedUntil)) {
      byLabel.lockedUntil[date] = (byLabel.lockedUntil[date] ?? 0n) + minor;
    }
  }

  return {
    idleCostMinor,
    paidMinor,
    byLabel,
    idleAtMinimumCostMinor,
    excessIdleCostMinor,
    excessIdleSeatDays,
    paidSeatDays,
    ratioPercent: paidMinor === null ? '0.00' : formatRatioPercent(excessIdleCostMinor, paidMinor),
    exceedsIdleRatioThreshold: excessIdleSeatDays * 10n > paidSeatDays,
  };
}
