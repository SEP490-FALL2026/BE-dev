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

/** Everything still held, or the amounts named; the commitments that are not held are left as they are when nothing is named. */
export function planRelease(
  rows: readonly CommitmentRow[],
  amounts?: readonly { year: number; amountMinor: bigint }[],
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
    const row = rows.find((candidate) => candidate.year === named.year);
    if (!row) return { ok: false, refusal: 'NO_COMMITMENT', year: named.year };
    if (row.state === 'RELEASED') return { ok: false, refusal: 'NOT_HELD', year: named.year };
    if (named.amountMinor <= 0n) return { ok: false, refusal: 'AMOUNT_NOT_POSITIVE', year: named.year };
    // A share is a share of what the commitment was made for less what already went back. What the invoices took of it is an
    // expense and does not go back, so a share that reaches into it gives back only what is still held (`US-06-06` AC-9).
    if (named.amountMinor > row.amountMinor - row.releasedMinor) {
      return { ok: false, refusal: 'EXCEEDS_HELD', year: named.year };
    }
    const heldMinor = row.state === 'HELD' ? heldOf(row) : 0n;
    if (heldMinor === 0n) continue;
    const takeMinor = named.amountMinor < heldMinor ? named.amountMinor : heldMinor;
    items.push({ id: row.id, year: row.year, takeMinor, leftMinor: heldMinor - takeMinor });
  }

  return { ok: true, items };
}

/** Finance lets the remainder of one commitment go: only one that is still held, and only with a reason (`AC-6`). */
export function planRemainder(row: CommitmentRow, reason: string): ReleasePlan {
  if (row.state !== 'HELD') return { ok: false, refusal: 'NOT_HELD', year: row.year };
  if (reason.trim() === '') return { ok: false, refusal: 'REASON_REQUIRED' };

  return { ok: true, items: [{ id: row.id, year: row.year, takeMinor: heldOf(row), leftMinor: 0n }] };
}
