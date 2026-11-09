import { addDays, type BusinessDate } from '../../../core/business-date';
import type { GhostSeatEvidence } from '../ghost-seat/ghost-seat-evidence.json';
import type { GhostSeatGroup, GhostSeatState } from '../ghost-seat/ghost-seat.types';
import { isReclaimable } from '../ghost-seat/ghost-seat-state.policy';

/** Whom the table is read for: the departments the IT Admin is in charge of (`MINE`) or the whole organization (`ALL`, `QĐ-58b`). */
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

/** The departments a read is limited to, or undefined for the whole organization. */
export function departmentsOfScope(scope: DepartmentScope, inChargeOf: readonly string[]): string[] | undefined {
  return scope === 'MINE' ? [...inChargeOf] : undefined;
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
