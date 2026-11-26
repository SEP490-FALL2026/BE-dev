import type { BusinessDate } from '../../../core/business-date';
import { commitmentApplication, splitSeatMonth } from './seat-month.policy';
import type { HeldRange, PlacementPeriod } from './seat-month.types';

/** A seat of a subscription in the month, with what the plan needs of it: who holds it, the days, and the commitment of the request behind it. */
export interface SeatToCharge {
  assignmentId: string;
  employeeId: string;
  /** Plan id of the seat, used to match line-level pricing (`B2-R7`). */
  planId?: string;
  /** Per-line monthly price when resolved from `subscription_lines`; falls back to period price when undefined. */
  monthlyPriceMinor?: bigint | null;
  /** A service account answers to one department whoever holds it; null for a personal seat. */
  fixedDepartmentId: string | null;
  held: HeldRange;
  placements: readonly PlacementPeriod[];
  commitment: { id: string; costCenterId: string } | null;
}

/** What a row of the month already applied to a commitment, found again when the month is charged again. */
export interface PriorRow {
  assignmentId: string;
  departmentId: string;
  appliedMinor: bigint;
  commitmentId: string | null;
}

export interface PlannedRow {
  assignmentId: string;
  employeeId: string;
  departmentId: string;
  costCenterId: string | null;
  days: number;
  monthlyPriceMinor: bigint;
  amountMinor: bigint;
  commitmentId: string | null;
  appliedMinor: bigint;
}

/** What a row of the month applied before and applies no more: the commitment gets it back, as the table of reversals records it. */
export interface ReturnedApplication {
  commitmentId: string;
  assignmentId: string;
  departmentId: string;
  amountMinor: bigint;
  /** `RECALCULATED` when the row stays and applies less (or nothing); `SEAT_NOT_ASKED` when the row is gone. */
  reason: 'RECALCULATED' | 'SEAT_NOT_ASKED';
}

export interface SeatMonthPlan {
  rows: PlannedRow[];
  /** What more each commitment is taken down by: only what a row applies more than it did before on the same commitment. */
  takenByCommitment: Map<string, bigint>;
  /** What the rows applied before and apply no more, to be returned to the commitments before anything is taken. */
  returned: ReturnedApplication[];
}

const keyOf = (assignmentId: string, departmentId: string): string => `${assignmentId}|${departmentId}`;

/**
 * What a month of a subscription costs each department and what of it takes a commitment down (`SM-1`). Pure: the caller gives the seats with where
 * their holders were placed, the Cost Center of each department, what each commitment still holds, and the rows the month already has.
 *
 * The price of a month of a seat is the subscription's, the same for every seat of the month and for a seat a renewal carried on (`SM1-07`, `QĐ-103r`,
 * `QĐ-104c`: the monthly price converted from the cycle); a subscription with no known price costs no department anything: its days fall to the pool
 * line. A row takes the commitment of the seat down by its whole amount, no more than the commitment still holds, and only when the Cost Center of the
 * department is the commitment's own, never the commitment of another Cost Center. A month may be charged again at any time (`QĐ-111ae`: closing the
 * numbers of a month is a picture, not a lock): what the rows applied before is first counted as held again, so the same inputs give the same rows and
 * return nothing, a row that now applies less (or none, or is gone) returns the difference, and what it returns is held for the rows after it (`SM1-06`).
 */
export function planSeatMonth(input: {
  month: BusinessDate;
  subscriptionMonthlyPriceMinor: bigint | null;
  seats: readonly SeatToCharge[];
  costCenterOfDepartment: ReadonlyMap<string, string>;
  heldByCommitment: ReadonlyMap<string, bigint>;
  prior: readonly PriorRow[];
  /** When present for a commitment id: remaining held on `month` slice, or `null` if that commitment has slices for other months only. */
  monthlySliceByCommitment?: ReadonlyMap<string, bigint | null>;
}): SeatMonthPlan {
  const held = initialHeldByCommitment(input.heldByCommitment, input.monthlySliceByCommitment);
  for (const row of input.prior) {
    if (row.commitmentId !== null && row.appliedMinor > 0n)
      held.set(row.commitmentId, (held.get(row.commitmentId) ?? 0n) + row.appliedMinor);
  }
  const rows = input.seats.flatMap((seat) => {
    const monthlyPrice =
      seat.monthlyPriceMinor !== undefined ? seat.monthlyPriceMinor : input.subscriptionMonthlyPriceMinor;

    return monthlyPrice === null ? [] : rowsOfSeat(seat, monthlyPrice, input, held);
  });

  return { rows, takenByCommitment: takenOf(input.prior, rows), returned: returnedOf(input.prior, rows) };
}

function initialHeldByCommitment(
  heldByCommitment: ReadonlyMap<string, bigint>,
  monthlySliceByCommitment?: ReadonlyMap<string, bigint | null>,
): Map<string, bigint> {
  const held = new Map(heldByCommitment);
  if (!monthlySliceByCommitment) return held;
  for (const [id, sliceRemaining] of monthlySliceByCommitment) {
    if (sliceRemaining === null) {
      held.set(id, 0n);
      continue;
    }
    const current = held.get(id) ?? 0n;
    held.set(id, sliceRemaining < current ? sliceRemaining : current);
  }
  return held;
}

/** The rows of one seat for the month, taking what each applies out of `held` so the rows after it see what is left. */
function rowsOfSeat(
  seat: SeatToCharge,
  monthlyPriceMinor: bigint,
  input: { month: BusinessDate; costCenterOfDepartment: ReadonlyMap<string, string> },
  held: Map<string, bigint>,
): PlannedRow[] {
  const segments = splitSeatMonth({
    monthlyPriceMinor,
    month: input.month,
    held: seat.held,
    placements: seat.placements,
    fixedDepartmentId: seat.fixedDepartmentId,
  });

  return segments.map((segment) => {
    const costCenterId = input.costCenterOfDepartment.get(segment.departmentId) ?? null;
    const availableMinor = seat.commitment ? (held.get(seat.commitment.id) ?? 0n) : 0n;
    const appliedMinor = commitmentApplication({
      amountMinor: segment.amountMinor,
      heldMinor: availableMinor,
      sameCostCenter:
        seat.commitment !== null && costCenterId !== null && seat.commitment.costCenterId === costCenterId,
    });
    if (seat.commitment && appliedMinor > 0n) held.set(seat.commitment.id, availableMinor - appliedMinor);

    return {
      assignmentId: seat.assignmentId,
      employeeId: seat.employeeId,
      departmentId: segment.departmentId,
      costCenterId,
      days: segment.days,
      monthlyPriceMinor,
      amountMinor: segment.amountMinor,
      commitmentId: appliedMinor > 0n && seat.commitment ? seat.commitment.id : null,
      appliedMinor,
    };
  });
}

/** What more each commitment gives up than the rows gave it before, by commitment. */
function takenOf(prior: readonly PriorRow[], rows: readonly PlannedRow[]): Map<string, bigint> {
  const before = new Map(prior.map((row) => [keyOf(row.assignmentId, row.departmentId), row]));
  const taken = new Map<string, bigint>();
  for (const row of rows) {
    if (row.commitmentId === null) continue;
    const previous = before.get(keyOf(row.assignmentId, row.departmentId));
    const sameBefore = previous?.commitmentId === row.commitmentId ? previous.appliedMinor : 0n;
    const more = row.appliedMinor - sameBefore;
    if (more > 0n) taken.set(row.commitmentId, (taken.get(row.commitmentId) ?? 0n) + more);
  }

  return taken;
}

/** What each row applied before and applies no more, in the order of the rows of before. */
function returnedOf(prior: readonly PriorRow[], rows: readonly PlannedRow[]): ReturnedApplication[] {
  const now = new Map(rows.map((row) => [keyOf(row.assignmentId, row.departmentId), row]));
  const returned: ReturnedApplication[] = [];
  for (const previous of prior) {
    if (previous.commitmentId === null || previous.appliedMinor <= 0n) continue;
    const row = now.get(keyOf(previous.assignmentId, previous.departmentId));
    const kept = row?.commitmentId === previous.commitmentId ? row.appliedMinor : 0n;
    const amountMinor = previous.appliedMinor - kept;
    if (amountMinor > 0n) {
      returned.push({
        commitmentId: previous.commitmentId,
        assignmentId: previous.assignmentId,
        departmentId: previous.departmentId,
        amountMinor,
        reason: row ? 'RECALCULATED' : 'SEAT_NOT_ASKED',
      });
    }
  }

  return returned;
}
