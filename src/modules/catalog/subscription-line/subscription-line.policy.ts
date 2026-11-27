import type { BusinessDate } from '../../../core/business-date';

/** The bounds of a line that decide whether it serves a day. */
export interface ServingLineInput {
  ledgerOpenedOn: BusinessDate | null;
  closedOn: BusinessDate | null;
}

/** The bounds of the period a line belongs to. */
export interface ServingPeriodInput {
  status?: 'DRAFT' | 'ACTIVE';
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
}

/** A serving line candidate for granting a K2 seat on a day. */
export interface LineCandidate extends ServingLineInput {
  id: string;
  createdAt: Date;
  free: number;
  subscription: ServingPeriodInput;
}

/**
 * Whether a subscription line serves `day`: the period is active and covers `day`, the ledger has opened by `day` (or the line
 * has no ledger yet), and the line has not closed before `day` (a line closed as `RENEWED` still serves through `closedOn`).
 */
export function isLineServingOn(line: ServingLineInput, day: BusinessDate, subscription: ServingPeriodInput): boolean {
  if (subscription.status !== undefined && subscription.status !== 'ACTIVE') return false;
  if (subscription.startDate !== null && day < subscription.startDate) return false;
  if (subscription.endDate !== null && day > subscription.endDate) return false;
  if (line.ledgerOpenedOn !== null && day < line.ledgerOpenedOn) return false;
  if (line.closedOn !== null && day > line.closedOn) return false;

  return true;
}

/** Compares two lines by creation time, then by id as a deterministic tie-breaker. */
export function compareLineOrder(
  a: Pick<LineCandidate, 'createdAt' | 'id'>,
  b: Pick<LineCandidate, 'createdAt' | 'id'>,
): number {
  const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (timeDiff !== 0) return timeDiff;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Picks which line of a K2 plan takes a grant on `day`: only lines serving `day` are considered (including a `RENEWED` line
 * through its `closedOn`), lines with at least one free seat come before full lines, and ties break by `createdAt` then `id`.
 */
export function chooseLine<T extends LineCandidate>(lines: readonly T[], day: BusinessDate): T | null {
  const serving = lines.filter((line) => isLineServingOn(line, day, line.subscription));
  if (serving.length === 0) return null;

  return [...serving].sort((a, b) => Number(b.free > 0) - Number(a.free > 0) || compareLineOrder(a, b))[0] ?? null;
}
