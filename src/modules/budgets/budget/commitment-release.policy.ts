/**
 * The rules of the money that goes back to the budget from a commitment (`US-06-06`), as pure decisions: how much goes back
 * and from which commitment, and what refuses it. A commitment that became an expense or was released does not go back to
 * being held (`AC-4`), and what became an expense stays when the rest is released: a share named for a commitment that is an
 * expense gives back nothing, and a share larger than what is still held gives back what is held.
 */

export interface CommitmentRow {
  id: string;
  year: number;
  amountMinor: bigint;
  releasedMinor: bigint;
  /** What became an expense through invoices: it does not go back to the budget. */
  appliedMinor: bigint;
  state: 'HELD' | 'RELEASED' | 'EXPENSED';
}

export type ReleaseRefusal =
  /** The request holds no commitment for the year named. */
  | 'NO_COMMITMENT'
  /** The commitment is released or became an expense: it is not held, and it does not become held again (`AC-4`). */
  | 'NOT_HELD'
  | 'AMOUNT_NOT_POSITIVE'
  | 'EXCEEDS_HELD'
  | 'REASON_REQUIRED'
  /** The year is named twice. */
  | 'YEAR_REPEATED';

export interface PlannedRelease {
  id: string;
  year: number;
  /** What goes back now. */
  takeMinor: bigint;
  /** What is held after it. */
  leftMinor: bigint;
}

export type ReleasePlan = { ok: true; items: PlannedRelease[] } | { ok: false; refusal: ReleaseRefusal; year?: number };

/** What a commitment still holds: its amount less what went back to the budget and less what became an expense (`US-06-06` AC-4, AC-9). */
export const heldOf = (row: CommitmentRow): bigint => row.amountMinor - row.releasedMinor - row.appliedMinor;

function planYearRelease(
  rows: readonly CommitmentRow[],
  named: { year: number; amountMinor: bigint; months?: readonly unknown[] },
): { ok: true; item: PlannedRelease | null } | { ok: false; refusal: ReleaseRefusal; year: number } {
  const row = rows.find((candidate) => candidate.year === named.year);
  if (!row) return { ok: false, refusal: 'NO_COMMITMENT', year: named.year };
  if (row.state === 'RELEASED') return { ok: false, refusal: 'NOT_HELD', year: named.year };
  if (named.amountMinor <= 0n) return { ok: false, refusal: 'AMOUNT_NOT_POSITIVE', year: named.year };
  const hasMonths = Array.isArray(named.months) && named.months.length > 0;
  // A share is a share of what the commitment was made for less what already went back. When monthly targets are given,
  // spreadRelease caps each slice against what remains in that month instead of refusing on formula sums.
  if (!hasMonths && named.amountMinor > row.amountMinor - row.releasedMinor) {
    return { ok: false, refusal: 'EXCEEDS_HELD', year: named.year };
  }
  const heldMinor = row.state === 'HELD' ? heldOf(row) : 0n;
  if (heldMinor === 0n) return { ok: true, item: null };
  const takeMinor = named.amountMinor < heldMinor ? named.amountMinor : heldMinor;
  return { ok: true, item: { id: row.id, year: row.year, takeMinor, leftMinor: heldMinor - takeMinor } };
}

/** Everything still held, or the amounts named; the commitments that are not held are left as they are when nothing is named. */
export function planRelease(
  rows: readonly CommitmentRow[],
  amounts?: readonly { year: number; amountMinor: bigint; months?: readonly unknown[] }[],
): ReleasePlan {
  if (amounts === undefined) {
    return {
      ok: true,
      items: rows
        .filter((row) => row.state === 'HELD')
        .map((row) => ({ id: row.id, year: row.year, takeMinor: heldOf(row), leftMinor: 0n })),
    };
  }

  const items: PlannedRelease[] = [];
  const years = new Set<number>();
  for (const named of amounts) {
    if (years.has(named.year)) return { ok: false, refusal: 'YEAR_REPEATED', year: named.year };
    years.add(named.year);
    const step = planYearRelease(rows, named);
    if (!step.ok) return step;
    if (step.item !== null) items.push(step.item);
  }

  return { ok: true, items };
}

/** Finance lets the remainder of one commitment go: only one that is still held, and only with a reason (`AC-6`). */
export function planRemainder(row: CommitmentRow, reason: string): ReleasePlan {
  if (row.state !== 'HELD') return { ok: false, refusal: 'NOT_HELD', year: row.year };
  if (reason.trim() === '') return { ok: false, refusal: 'REASON_REQUIRED' };

  return { ok: true, items: [{ id: row.id, year: row.year, takeMinor: heldOf(row), leftMinor: 0n }] };
}

export interface AttachedCommitment {
  id: string;
  requestId: string;
  amountMinor: bigint;
  currency: string;
}

export interface CommitmentOfRequest extends CommitmentRow {
  organizationId: string;
  costCenterId: string;
  /** How much of `applied_minor` has already been reflected back via D-16 transfer returns. */
  transferReturnedMinor?: bigint;
}

/** A commitment of a request as `lockOfRequest` reads it: with where it came from and what one seat costs a month in it. */
export interface LockedCommitmentOfRequest extends CommitmentOfRequest {
  origin: 'APPROVAL' | 'YEAR_START';
  seatMonthlyMinor: bigint | null;
  /** The version it is attached to; null while it waits for a budget (R-48). */
  attachedVersionId: string | null;
}

/** A commitment still held that knows what one seat costs a month, with what it still holds. */
export interface HeldWithSeatPrice {
  costCenterId: string;
  year: number;
  requestId: string;
  heldMinor: bigint;
  seatMonthlyMinor: bigint;
}

/** What a commitment total says about the budget of a Cost Center and year. */
export interface CommitmentTotals {
  held: bigint;
  spent: bigint;
}

export const heldKey = (costCenterId: string, year: number): string => `${costCenterId}:${year}`;

export interface CommitmentSnapshotRow {
  id: string;
  requestId: string;
  year: number;
  amountMinor: bigint;
  releasedMinor: bigint;
  appliedMinor: bigint;
  state: 'HELD' | 'RELEASED' | 'EXPENSED';
  organizationId: string;
  costCenterId: string;
  origin: 'APPROVAL' | 'YEAR_START';
  seatMonthlyMinor: bigint | null;
  attachedVersionId: string | null;
  currency: string;
  transferReturnedMinor: bigint;
}

/** Maps a `budget_commitments` row into `LockedCommitmentOfRequest`. */
export const toLockedCommitment = (row: CommitmentSnapshotRow): LockedCommitmentOfRequest => ({
  id: row.id,
  year: row.year,
  amountMinor: row.amountMinor,
  releasedMinor: row.releasedMinor,
  appliedMinor: row.appliedMinor,
  state: row.state,
  organizationId: row.organizationId,
  costCenterId: row.costCenterId,
  origin: row.origin,
  seatMonthlyMinor: row.seatMonthlyMinor,
  attachedVersionId: row.attachedVersionId,
  transferReturnedMinor: row.transferReturnedMinor,
});

/** Computes next commitment state and released total when returning `takeMinor` from a `HELD` commitment. */
export function buildReleaseMutation(
  row: CommitmentRow,
  takeMinor: bigint,
  now: Date,
): { released: boolean; heldMinor: bigint; releasedMinor: bigint; state?: 'RELEASED' | 'EXPENSED'; releasedAt?: Date } {
  const releasedMinor = row.releasedMinor + takeMinor;
  const heldMinor = row.amountMinor - releasedMinor - row.appliedMinor;
  const released = heldMinor === 0n;
  if (released && row.appliedMinor === 0n)
    return { released, heldMinor, releasedMinor, state: 'RELEASED', releasedAt: now };
  if (released) return { released, heldMinor, releasedMinor, state: 'EXPENSED' };

  return { released, heldMinor, releasedMinor };
}

/** Builds Prisma `where` clause for `CommitmentRepo.page`. */
export function commitmentPageWhere(filter: {
  id?: string;
  attached?: boolean;
  year?: number;
  costCenterId?: string;
  costCenterIds?: readonly string[];
  requestId?: string;
  state?: 'HELD' | 'RELEASED' | 'EXPENSED';
}) {
  return {
    ...(filter.state ? { state: filter.state } : {}),
    ...(filter.attached === undefined ? {} : { attachedVersionId: filter.attached ? { not: null } : null }),
    ...(filter.year ? { year: filter.year } : {}),
    ...(filter.costCenterId ? { costCenterId: filter.costCenterId } : {}),
    ...(filter.requestId ? { requestId: filter.requestId } : {}),
    ...(filter.id ? { id: filter.id } : {}),
    ...(filter.costCenterIds ? { AND: [{ costCenterId: { in: [...filter.costCenterIds] } }] } : {}),
  };
}

/** Filters commitments to positive held amounts with monthly seat pricing (`heldWithSeatPrice`). */
export function mapHeldWithSeatPrices(
  rows: readonly {
    costCenterId: string;
    year: number;
    requestId: string;
    amountMinor: bigint;
    releasedMinor: bigint;
    appliedMinor: bigint;
    seatMonthlyMinor: bigint | null;
  }[],
): HeldWithSeatPrice[] {
  return rows.flatMap((row) => {
    const heldMinor = row.amountMinor - row.releasedMinor - row.appliedMinor;
    return heldMinor > 0n && row.seatMonthlyMinor !== null
      ? [
          {
            costCenterId: row.costCenterId,
            year: row.year,
            requestId: row.requestId,
            heldMinor,
            seatMonthlyMinor: row.seatMonthlyMinor,
          },
        ]
      : [];
  });
}
