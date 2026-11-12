import { addDays, type BusinessDate } from '../../../core/business-date';
import type { GhostSeatEvidence } from '../ghost-seat/ghost-seat-evidence.json';
import type { GhostSeatGroup, GhostSeatState } from '../ghost-seat/ghost-seat.types';
import { isReclaimable } from '../ghost-seat/ghost-seat-state.policy';

/** The scope a client asks the table for. Both read the scope of the IT Admin (`QĐ-111ax`); `ALL` stays on the wire and no longer widens it. */
export type DepartmentScope = 'MINE' | 'ALL';

/** The label of how sure a recommendation is: `G1` and `G2` come from the data of the system itself, with no level and no percentage (`QĐ-35b`). */
export type ConfidenceLabel = 'INTERNAL_DATA';

/** `G3` and `G4` carry the labels of the item that makes them (usage data); until then every group is read as internal data. */
const CONFIDENCE_LABELS: Readonly<Record<GhostSeatGroup, ConfidenceLabel>> = {
  G1: 'INTERNAL_DATA',
  G2: 'INTERNAL_DATA',
  G3: 'INTERNAL_DATA',
  G4: 'INTERNAL_DATA',
};

export const confidenceLabelOf = (group: GhostSeatGroup): ConfidenceLabel => CONFIDENCE_LABELS[group];

/** What a row of the table says besides its state (`US-10-05` AC-1, `US-07-05` AC-12): the reclaim under way, a K1 access that runs on, a holder who left. */
export interface GhostSeatLabels {
  revocationUnderWay: boolean;
  terminatingUntil: boolean;
  holderLeft: boolean;
}

export function labelsOf(row: {
  state: GhostSeatState;
  revocationTaskId: string | null;
  holderLeftOn: BusinessDate | null;
  evidence: GhostSeatEvidence;
}): GhostSeatLabels {
  return {
    revocationUnderWay: row.state === 'RECLAIM_DECIDED' && row.revocationTaskId !== null,
    terminatingUntil: row.evidence.group === 'G2' && row.evidence.terminatingAccess !== null,
    holderLeft: row.holderLeftOn !== null,
  };
}

/** The IT Admin may open a reclaim on a row that is an open `G2` (the button of the table). */
export const canReclaim = (row: { group: GhostSeatGroup; state: GhostSeatState }): boolean => isReclaimable(row);

/**
 * What a filter on one department makes of the scope of the reader (`QĐ-111aw`): no filter keeps the scope; a department inside it (or any, when the
 * scope is the whole organization, undefined) is read exactly; a department outside it reads nothing, never an error.
 */
export function narrowToDepartment(
  scope: readonly string[] | undefined,
  departmentId: string | undefined,
): { departmentIds?: string[]; departmentId?: string } | 'OUT_OF_SCOPE' {
  if (departmentId === undefined) return scope ? { departmentIds: [...scope] } : {};
  if (scope && !scope.includes(departmentId)) return 'OUT_OF_SCOPE';

  return { departmentId };
}

/** The sentence the summary carries for internal software (`US-10-01` AC-8, `US-10-05` AC-7, `US-10-02` AC-9, `QĐ-62o`). */
export const INTERNAL_SOFTWARE_LIMITATION =
  'Phần mềm nội bộ: chưa có nguồn usage nên chưa nhận diện được G2, G3, G4 cho phần mềm nội bộ; G1 không áp dụng.';

/** `KPI-5` is read over a period of at most a year (a business bound for the reader, never a window of data). */
export const KPI5_MAX_PERIOD_DAYS = 366;

/** Whether `from` to `to` (both included) is a period `KPI-5` is read over. */
export function isValidKpi5Period(from: BusinessDate, to: BusinessDate): boolean {
  return from <= to && addDays(from, KPI5_MAX_PERIOD_DAYS - 1) >= to;
}

/**
 * What a head reads of the evidence of a recommendation (`SoD-2`, `FR-4.12`, BRD 7.5): the state, the last day of activity, the days and the
 * thresholds they were judged against, the confidence level, the end of a right and what was decided before, and of each source only its name,
 * its kind and the days it covers. How the person was tied, how old each source was, what it reads as activity and why the confidence is what it
 * is stay with the IT Admin. The evidence of a `G1` or a `G2` is the IT Admin's and is never a head's.
 */
export function headEvidenceOf(evidence: GhostSeatEvidence): Record<string, unknown> {
  if (evidence.group !== 'G3' && evidence.group !== 'G4') return { group: evidence.group };

  return {
    group: evidence.group,
    activityStatus: evidence.activityStatus,
    lastActiveDate: evidence.lastActiveDate,
    inactiveDays: evidence.inactiveDays,
    coverageDays: evidence.coverageDays,
    thresholds: evidence.thresholds,
    confidence: { level: evidence.confidence.level },
    timeBound: evidence.timeBound,
    potentialSaving: evidence.potentialSaving,
    previousDecision: evidence.previousDecision ?? null,
    sources: evidence.sources.map((source) => ({
      name: source.name,
      kind: source.kind,
      coverageFrom: source.coverageFrom,
      coverageTo: source.coverageTo,
    })),
  };
}
