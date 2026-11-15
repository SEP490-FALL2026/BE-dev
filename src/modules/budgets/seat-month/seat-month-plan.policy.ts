import type { BusinessDate } from '../../../core/business-date';
import { commitmentApplication, splitSeatMonth } from './seat-month.policy';
import type { HeldRange, PlacementPeriod } from './seat-month.types';

/** A seat of a subscription in the month, with what the plan needs of it: who holds it, the days, and the commitment of the request behind it. */
export interface SeatToCharge {
  assignmentId: string;
  employeeId: string;
  /** A service account answers to one department whoever holds it; null for a personal seat. */
  fixedDepartmentId: string | null;
  held: HeldRange;
  placements: readonly PlacementPeriod[];
  commitment: { id: string; costCenterId: string; seatMonthlyMinor: bigint | null } | null;
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

export interface SeatMonthPlan {
  rows: PlannedRow[];
  /** What more each commitment is taken down by: only what is more than the rows applied before (an expense does not come back). */
  takenByCommitment: Map<string, bigint>;
}

const keyOf = (assignmentId: string, departmentId: string): string => `${assignmentId}|${departmentId}`;

/**
 * What a month of a subscription costs each department and what of it takes a commitment down (`SM-1`). Pure: the caller gives the seats with where
 * their holders were placed, the Cost Center of each department, what each commitment still holds, and the rows the month already has.
 *
 * The price of a month of a seat is the one on its commitment when it has one, else the subscription's (a seat with neither costs no department
 * anything: its days fall to the pool line). A row takes the commitment of the seat down by its whole amount, no more than the commitment still
 * holds, when the Cost Center of the department is the commitment's own. What a row applied before still counts as held by it, so charging the
 * same month again applies nothing twice and never less than before.
 */
export function planSeatMonth(input: {
  month: BusinessDate;
  subscriptionMonthlyPriceMinor: bigint | null;
  seats: readonly SeatToCharge[];
  costCenterOfDepartment: ReadonlyMap<string, string>;
  heldByCommitment: ReadonlyMap<string, bigint>;
  prior: readonly PriorRow[];
}): SeatMonthPlan {
  const held = new Map(input.heldByCommitment);
  const priorOf = new Map(input.prior.map((row) => [keyOf(row.assignmentId, row.departmentId), row]));
  const taken = new Map<string, bigint>();
  const rows: PlannedRow[] = [];

  for (const seat of input.seats) {
    const monthlyPriceMinor = seat.commitment?.seatMonthlyMinor ?? input.subscriptionMonthlyPriceMinor;
    if (monthlyPriceMinor === null) continue;
    for (const segment of splitSeatMonth({
      monthlyPriceMinor,
      month: input.month,
      held: seat.held,
      placements: seat.placements,
      fixedDepartmentId: seat.fixedDepartmentId,
    })) {
      const costCenterId = input.costCenterOfDepartment.get(segment.departmentId) ?? null;
      const before = priorOf.get(keyOf(seat.assignmentId, segment.departmentId));
      const availableMinor = seat.commitment ? (held.get(seat.commitment.id) ?? 0n) : 0n;
      const applied = appliedOf({
        amountMinor: segment.amountMinor,
        seat,
        costCenterId,
        priorMinor: before?.appliedMinor ?? 0n,
        availableMinor,
      });
      if (seat.commitment) takeMore(seat.commitment.id, applied.moreMinor, held, taken);
      rows.push(
        plannedRow({ seat, segment, costCenterId, monthlyPriceMinor, before, appliedMinor: applied.appliedMinor }),
      );
    }
  }

  return { rows, takenByCommitment: taken };
}

function plannedRow(input: {
  seat: SeatToCharge;
  segment: { departmentId: string; days: number; amountMinor: bigint };
  costCenterId: string | null;
  monthlyPriceMinor: bigint;
  before: PriorRow | undefined;
  appliedMinor: bigint;
}): PlannedRow {
  const { seat, segment, before } = input;

  return {
    assignmentId: seat.assignmentId,
    employeeId: seat.employeeId,
    departmentId: segment.departmentId,
    costCenterId: input.costCenterId,
    days: segment.days,
    monthlyPriceMinor: input.monthlyPriceMinor,
    amountMinor: segment.amountMinor,
    commitmentId: input.appliedMinor > 0n ? (before?.commitmentId ?? seat.commitment?.id ?? null) : null,
    appliedMinor: input.appliedMinor,
  };
}

/** What a commitment gives up more: it holds that much less for the rows after, and the plan says it takes that much more down. */
function takeMore(
  commitmentId: string,
  moreMinor: bigint,
  held: Map<string, bigint>,
  taken: Map<string, bigint>,
): void {
  if (moreMinor <= 0n) return;
  held.set(commitmentId, (held.get(commitmentId) ?? 0n) - moreMinor);
  taken.set(commitmentId, (taken.get(commitmentId) ?? 0n) + moreMinor);
}

/** What a row applies: the amount of the commitment of its own Cost Center, with what it applied before counted as still held, and what is more. */
function appliedOf(input: {
  amountMinor: bigint;
  seat: SeatToCharge;
  costCenterId: string | null;
  priorMinor: bigint;
  availableMinor: bigint;
}): { appliedMinor: bigint; moreMinor: bigint } {
  const { seat, costCenterId } = input;
  const sameCostCenter =
    seat.commitment !== null && costCenterId !== null && seat.commitment.costCenterId === costCenterId;
  const wanted = commitmentApplication({
    amountMinor: input.amountMinor,
    heldMinor: input.priorMinor + input.availableMinor,
    sameCostCenter,
  });
  // What applied before stays applied, as far as the amount of the row holds it.
  const kept = input.priorMinor < input.amountMinor ? input.priorMinor : input.amountMinor;
  const appliedMinor = wanted > kept ? wanted : kept;

  return { appliedMinor, moreMinor: appliedMinor > input.priorMinor ? appliedMinor - input.priorMinor : 0n };
}
