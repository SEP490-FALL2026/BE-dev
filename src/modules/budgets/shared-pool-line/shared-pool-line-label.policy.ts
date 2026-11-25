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
  ratioPercent: string;
  exceedsIdleRatioThreshold: boolean;
}

interface Segment {
  kind: 'REDUCIBLE' | 'LOCKED_UNTIL';
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

function classifyDay(input: LabelClassificationInput, day: BusinessDate, idleToday: number, segments: Segment[]): void {
  const q = input.purchasedQuantity as number;
  const point = adjustmentPointOf(input, day, input.windows);
  if (point === null) {
    pushSegment(segments, 'REDUCIBLE', null, idleToday);
    return;
  }
  if (day >= point.point && day <= point.deadline) {
    pushSegment(segments, 'REDUCIBLE', null, idleToday);
    return;
  }
  const commitment = adjustmentCommitmentOf(input);
  if (commitment === 'ANNUAL' && day > point.deadline) {
    const qNext = input.qNext ?? q;
    const reducedShare = Math.max(0, Math.min(idleToday, q - qNext));
    const keptShare = idleToday - reducedShare;
    pushSegment(segments, 'LOCKED_UNTIL', point.end, reducedShare);
    pushSegment(segments, 'LOCKED_UNTIL', earliestReducibleOn(input, day) ?? point.end, keptShare);
    return;
  }

  pushSegment(segments, 'LOCKED_UNTIL', point.end, idleToday);
}

/**
 * Splits a period's monthly idle seat cost into adjustment-window buckets (`W3-06` + Q-F R-LATE split) with remainder
 * assigned to the final segment so bucket totals sum exactly to `idleCostMinor`, and computes the 10% excess-idle alert check
 * excluding vendor minimum seat commitments. Pure.
 */
export function classifyIdleSeatCosts(
  input: LabelClassificationInput,
  seats: readonly HeldSeatInterval[],
  month: BusinessDate,
): IdleCostClassification {
  const cost = poolPeriodMonthCost(input, seats, month);
  if (cost.idleCostMinor === null || cost.paidMinor === null) {
    return emptyResult(cost.idleCostMinor, cost.paidMinor);
  }
  if (cost.idleCostMinor === 0n || cost.paidMinor === 0n) {
    return emptyResult(cost.idleCostMinor, cost.paidMinor);
  }

  const q = input.purchasedQuantity as number;
  const monthly = input.monthlyPriceMinor as bigint;
  const minFloor = Math.min(input.vendorMinimumSeats ?? 0, q);
  const segments: Segment[] = [];
  let idleAtMinSeatDays = 0;

  for (const day of activeMonthDates(month, input.startDate, input.endExclusive)) {
    const heldToday = countHeldOnDay(seats, day);
    idleAtMinSeatDays += Math.max(0, minFloor - heldToday);
    const idleToday = Math.max(0, q - heldToday);
    if (idleToday > 0) classifyDay(input, day, idleToday, segments);
  }

  const byLabel: IdleCostByLabel = { missedAdjustmentMinor: 0n, reducibleMinor: 0n, lockedUntil: {} };
  let allocated = 0n;
  segments.forEach((seg, index) => {
    const amount =
      index === segments.length - 1
        ? cost.idleCostMinor! > allocated
          ? cost.idleCostMinor! - allocated
          : 0n
        : roundHalfAway(BigInt(seg.seatDays) * monthly, BigInt(cost.daysInMonth));
    allocated += amount;
    if (seg.kind === 'REDUCIBLE') {
      byLabel.reducibleMinor += amount;
    } else if (seg.until !== null) {
      byLabel.lockedUntil[seg.until] = (byLabel.lockedUntil[seg.until] ?? 0n) + amount;
    }
  });

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
    ratioPercent: formatRatioPercent(excessIdleCostMinor, cost.paidMinor),
    exceedsIdleRatioThreshold: excessIdleSeatDays * 10n > cost.paidSeatDays,
  };
}
