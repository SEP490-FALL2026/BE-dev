import type { BusinessDate } from '../../../core/business-date';
import type { EvidenceMatchMethod, EvidenceSourceKind } from '../public/usage-evidence.types';

/**
 * How old a source may be before its silence says nothing (`QĐ-101b`, `QT A.4`): a constant of the kind of source, not a setting of one
 * source (`DA6-09`). A report of a vendor is judged at 7 days, what a collector sent at 14.
 */
export const STALE_AFTER_DAYS: Readonly<Record<EvidenceSourceKind, number>> = { VENDOR: 7, COLLECTOR: 14 };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The days from the end of the coverage to the day of the request (negative when the coverage ends after it). */
export function ageDaysOf(coverageTo: BusinessDate, asOf: BusinessDate): number {
  return Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${coverageTo}T00:00:00Z`)) / MS_PER_DAY);
}

/** Whether a source of this kind is too old to conclude anything from its silence: more days than the kind allows (`US-10-02` AC-14). */
export function isStale(kind: EvidenceSourceKind, ageDays: number): boolean {
  return ageDays > STALE_AFTER_DAYS[kind];
}

/**
 * Whether the absence of activity in a source may be read as not used (`DA6-14`, `FR-4.14a`): never for a collector; for a vendor only if it
 * tells the negative as well as the positive and can tell the days (the last activity or the detail of events).
 */
export function canConcludeAbsence(
  kind: EvidenceSourceKind,
  vendor: { direction: 'POSITIVE_ONLY' | 'POSITIVE_AND_NEGATIVE'; capLastActivity: boolean; capEventDetail: boolean },
): boolean {
  return (
    kind === 'VENDOR' &&
    vendor.direction === 'POSITIVE_AND_NEGATIVE' &&
    (vendor.capLastActivity || vendor.capEventDetail)
  );
}

/** The groups a vendor can detect (`FR-4.4`): members only gives `G1` and `G2`; the last activity or the detail of events gives up to `G4`. */
export function detectableGroupsOf(vendor: {
  capMemberList: boolean;
  capLastActivity: boolean;
  capEventDetail: boolean;
}): Array<'G1' | 'G2' | 'G3' | 'G4'> {
  if (vendor.capLastActivity || vendor.capEventDetail) return ['G1', 'G2', 'G3', 'G4'];

  return vendor.capMemberList ? ['G1', 'G2'] : [];
}

/** How weak a way of tying an identifier is: a rule of aliases is weaker than an exact email or an account, and anything is weaker than a tie made by hand. */
const WEAKNESS: Readonly<Record<EvidenceMatchMethod, number>> = {
  ALIAS_RULE: 0,
  EXACT_EMAIL: 1,
  ACCOUNT_IDENTIFIER: 1,
  MANUAL: 2,
};

/** The weakest of these ways; null when there are none. */
export function weakestMethod(methods: readonly EvidenceMatchMethod[]): EvidenceMatchMethod | null {
  return methods.reduce<EvidenceMatchMethod | null>(
    (weakest, method) => (weakest === null || WEAKNESS[method] < WEAKNESS[weakest] ? method : weakest),
    null,
  );
}

/** The days of a list, each once, oldest first. */
export function distinctSorted(dates: readonly BusinessDate[]): BusinessDate[] {
  return [...new Set(dates)].sort();
}
