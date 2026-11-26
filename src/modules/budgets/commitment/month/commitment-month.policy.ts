import type { BusinessDate } from '../../../../core/business-date';
import type { CommitmentRow } from '../../budget/commitment-release.policy';

export type CommitmentState = CommitmentRow['state'];

export interface MonthCountInput {
  readonly month: BusinessDate;
  readonly seatCount: number;
}

export interface MonthSliceDraft {
  readonly commitmentId: string;
  readonly month: BusinessDate;
  readonly seatCount: number;
  readonly shareMinor: bigint;
}

export interface MonthlySliceState {
  readonly month: BusinessDate;
  readonly shareMinor: bigint;
  appliedMinor: bigint;
  releasedMinor: bigint;
}

export interface MonthTarget {
  readonly month: BusinessDate;
  readonly amountMinor: bigint;
}

export interface MonthAllocation {
  readonly month: BusinessDate;
  readonly takeMinor: bigint;
}

export interface SpreadResult {
  readonly allocations: readonly MonthAllocation[];
  readonly totalTakenMinor: bigint;
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function remainingOfSlice(slice: { shareMinor: bigint; appliedMinor: bigint; releasedMinor: bigint }): bigint {
  return maxBigInt(0n, slice.shareMinor - slice.appliedMinor - slice.releasedMinor);
}

/**
 * Builds monthly commitment slice rows for a K2 commitment.
 * Returns empty for K1/K4 (when `seatMonthlyMinor` is null or non-positive) or empty months.
 * Keeps sum(shareMinor) === amountMinor by adjusting the last month (clamped >= 0n if negative diff).
 */
export function monthRowsOf(input: {
  commitmentId: string;
  year: number;
  amountMinor: bigint;
  seatMonthlyMinor: bigint | null | undefined;
  months: readonly MonthCountInput[];
}): MonthSliceDraft[] {
  const unit = input.seatMonthlyMinor;
  if (unit === null || unit === undefined || unit <= 0n || input.months.length === 0) {
    return [];
  }

  const byMonth = new Map<BusinessDate, number>();
  for (const item of input.months) {
    if (item.seatCount <= 0) continue;
    byMonth.set(item.month, (byMonth.get(item.month) ?? 0) + item.seatCount);
  }
  const sorted = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length === 0) return [];

  const drafts = sorted.map(([month, seatCount]) => ({
    commitmentId: input.commitmentId,
    month,
    seatCount,
    shareMinor: unit * BigInt(seatCount),
  }));

  const baseSum = drafts.reduce((sum, d) => sum + d.shareMinor, 0n);
  let diff = input.amountMinor - baseSum;
  if (diff >= 0n) {
    const last = drafts[drafts.length - 1];
    drafts[drafts.length - 1] = { ...last, shareMinor: last.shareMinor + diff };
    return drafts;
  }

  // Absorb negative rounding/legacy price delta from last month backwards without negative shares.
  for (let i = drafts.length - 1; i >= 0 && diff < 0n; i--) {
    const reduce = minBigInt(drafts[i].shareMinor, -diff);
    drafts[i] = { ...drafts[i], shareMinor: drafts[i].shareMinor - reduce };
    diff += reduce;
  }
  return drafts;
}

/**
 * Caps monthly invoice application against a slice's remaining held amount (Ca E).
 */
export function applyToMonth(input: {
  amountMinor: bigint;
  shareMinor: bigint;
  appliedMinor: bigint;
  releasedMinor: bigint;
}): { appliedMinor: bigint; unallocatedMinor: bigint } {
  if (input.amountMinor <= 0n) {
    return { appliedMinor: 0n, unallocatedMinor: 0n };
  }
  const remaining = remainingOfSlice(input);
  const appliedMinor = minBigInt(input.amountMinor, remaining);
  return { appliedMinor, unallocatedMinor: input.amountMinor - appliedMinor };
}

/**
 * Spreads month-specific release targets (LATE_GRANT, REVOKED, GRANTED_FROM_POOL, TRANSFER_EFFECTIVE)
 * onto existing slices, capping each month at its remaining held amount (F1).
 */
export function spreadRelease(slices: readonly MonthlySliceState[], targets: readonly MonthTarget[]): SpreadResult {
  const byMonth = new Map(slices.map((s) => [s.month, s]));
  const allocations: MonthAllocation[] = [];
  let totalTakenMinor = 0n;

  for (const target of targets) {
    if (target.amountMinor <= 0n) continue;
    const slice = byMonth.get(target.month);
    if (!slice) continue;
    const takeMinor = minBigInt(target.amountMinor, remainingOfSlice(slice));
    if (takeMinor <= 0n) continue;
    allocations.push({ month: slice.month, takeMinor });
    byMonth.set(slice.month, { ...slice, releasedMinor: slice.releasedMinor + takeMinor });
    totalTakenMinor += takeMinor;
  }
  return { allocations, totalTakenMinor };
}

function takeFromSlices(sorted: readonly MonthlySliceState[], amountMinor: bigint, capPerSlice?: bigint): SpreadResult {
  const taken = new Map<BusinessDate, bigint>();
  let left = amountMinor;
  for (const slice of sorted) {
    if (left <= 0n) break;
    const sliceCap =
      capPerSlice === undefined ? remainingOfSlice(slice) : minBigInt(capPerSlice, remainingOfSlice(slice));
    const take = minBigInt(left, sliceCap);
    if (take <= 0n) continue;
    taken.set(slice.month, take);
    left -= take;
  }
  if (left > 0n && capPerSlice !== undefined) {
    for (const slice of sorted) {
      if (left <= 0n) break;
      const already = taken.get(slice.month) ?? 0n;
      const extra = minBigInt(left, remainingOfSlice(slice) - already);
      if (extra <= 0n) continue;
      taken.set(slice.month, already + extra);
      left -= extra;
    }
  }
  const allocations = sorted
    .filter((s) => (taken.get(s.month) ?? 0n) > 0n)
    .map((s) => ({ month: s.month, takeMinor: taken.get(s.month) ?? 0n }));
  return { allocations, totalTakenMinor: amountMinor - left };
}

/**
 * Spreads a release amount (e.g. PARTICIPANT_WITHDRAWN in a group request) across months
 * using at most `seatMonthlyMinor` per month first, then filling any residual from remaining slices.
 */
export function spreadBySeatMonthly(
  slices: readonly MonthlySliceState[],
  amountMinor: bigint,
  seatMonthlyMinor: bigint | null | undefined,
): SpreadResult {
  if (amountMinor <= 0n || slices.length === 0) {
    return { allocations: [], totalTakenMinor: 0n };
  }
  const sorted = [...slices].sort((a, b) => a.month.localeCompare(b.month));
  const perMonthCap = seatMonthlyMinor && seatMonthlyMinor > 0n ? seatMonthlyMinor : undefined;
  return takeFromSlices(sorted, amountMinor, perMonthCap);
}

/**
 * Spreads REMAINDER / full-release amounts from the last month backwards (Ca L: 12 -> 11 -> ...).
 */
export function spreadRemainder(slices: readonly MonthlySliceState[], amountMinor: bigint): SpreadResult {
  if (amountMinor <= 0n || slices.length === 0) {
    return { allocations: [], totalTakenMinor: 0n };
  }
  const reversed = [...slices].sort((a, b) => b.month.localeCompare(a.month));
  const allocations: MonthAllocation[] = [];
  let left = amountMinor;

  for (const slice of reversed) {
    if (left <= 0n) break;
    const takeMinor = minBigInt(left, remainingOfSlice(slice));
    if (takeMinor <= 0n) continue;
    allocations.push({ month: slice.month, takeMinor });
    left -= takeMinor;
  }
  return { allocations, totalTakenMinor: amountMinor - left };
}

export function settlementOf(slice: { shareMinor: bigint; appliedMinor: bigint; releasedMinor: bigint }): bigint {
  return maxBigInt(0n, slice.shareMinor - slice.appliedMinor - slice.releasedMinor);
}

/**
 * Derives commitment state after monthly/year-level updates (F3 / F3').
 */
export function stateOf(input: { amountMinor: bigint; appliedMinor: bigint; releasedMinor: bigint }): CommitmentState {
  if (input.amountMinor > input.appliedMinor + input.releasedMinor) {
    return 'HELD';
  }
  return input.appliedMinor > 0n ? 'EXPENSED' : 'RELEASED';
}
