import { DashboardRefusedError } from './dashboard-section.errors';

/*
 * One section of a role overview (`US-12-15` AC-2, AC-3, AC-4, AC-7) and the three ways it can stand. A section never answers a number it
 * does not have: a count is given only when this overview counted it in the caller's scope; a section whose rows live in an existing
 * operation that this overview does not count names that operation; a section whose data has no source yet says so with a reason, and is
 * never shown as zero (no usage, cost or device figure is ever guessed). Pure: no store, no clock.
 */

export const SECTION_STATES = ['COUNTED', 'AT_SOURCE', 'NOT_AVAILABLE'] as const;
export type SectionState = (typeof SECTION_STATES)[number];

/** Why a section has no data yet: the source that would hold it is not delivered, or nothing records it. */
export const MISSING_SOURCE_REASONS = [
  'FINANCE_FIGURES_NOT_DELIVERED',
  'USAGE_DATA_NOT_DELIVERED',
  'NO_DATA_SOURCE',
] as const;
export type MissingSourceReason = (typeof MISSING_SOURCE_REASONS)[number];

export interface DashboardSection {
  state: SectionState;
  /** Only when `COUNTED`: how many, in the caller's scope. Never a stand-in for data that does not exist. */
  count: number | null;
  /** The operation that lists the rows of the section, in the same scope; null when there is none yet. */
  sourceOperationId: string | null;
  /** Only when `NOT_AVAILABLE`. */
  reason: MissingSourceReason | null;
}

/**
 * A section this overview counted. `sourceOperationId` is null when no list gives exactly these rows (never a list that would answer another number).
 * Throws a RangeError for a count that is not a whole number of at least zero.
 */
export function counted(count: number, sourceOperationId: string | null): DashboardSection {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`A section counts whole items, not ${count}.`);

  return { state: 'COUNTED', count, sourceOperationId, reason: null };
}

/** A section whose rows the named operation lists in the caller's scope; this overview does not count them. */
export function atSource(sourceOperationId: string): DashboardSection {
  return { state: 'AT_SOURCE', count: null, sourceOperationId, reason: null };
}

/** A section whose data has no source yet: no count, no operation, and why. */
export function notAvailable(reason: MissingSourceReason): DashboardSection {
  return { state: 'NOT_AVAILABLE', count: null, sourceOperationId: null, reason };
}

/** The role each overview belongs to. */
export type DashboardRole = 'MANAGER' | 'IT_ADMIN' | 'SUPER_ADMIN';

/**
 * Throws DashboardRefusedError unless the caller holds the role of the overview: the service decides again, so the route is not the only
 * thing between a caller and the data.
 */
export function assertHoldsRole(roles: readonly string[], role: DashboardRole): void {
  if (!roles.includes(role)) throw new DashboardRefusedError();
}

/** Throws DashboardRefusedError unless the caller holds one of the roles: for a report two roles read, each in their own scope. */
export function assertHoldsOneOf(roles: readonly string[], allowed: readonly DashboardRole[]): void {
  if (!allowed.some((role) => roles.includes(role))) throw new DashboardRefusedError();
}
