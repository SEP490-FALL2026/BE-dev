import type { GhostSeatCloseReason, GhostSeatGroup, GhostSeatState, GhostSeatTier } from './ghost-seat.types';

/**
 * How a recommendation moves (the states of `FR-4.12`): it is made `OPEN`; a reclaim decided on it (by the IT Admin for `G2`, by the
 * head for `G3`/`G4`) makes it `RECLAIM_DECIDED`, and a reclaim closed as failed puts it back; a head who pauses a `G3`/`G4` makes it
 * `PAUSED`; anything closes with a reason and a closed one never moves again.
 */
const MOVES: Readonly<Record<GhostSeatState, readonly GhostSeatState[]>> = {
  OPEN: ['PAUSED', 'RECLAIM_DECIDED', 'CLOSED'],
  PAUSED: ['OPEN', 'RECLAIM_DECIDED', 'CLOSED'],
  RECLAIM_DECIDED: ['OPEN', 'CLOSED'],
  CLOSED: [],
};

export function canMove(from: GhostSeatState, to: GhostSeatState): boolean {
  return MOVES[from].includes(to);
}

/** The IT Admin may open the reclaim of a `G2` that is `OPEN` and nothing else (a `G1` has no seat; a decided one is already under way). */
export function isReclaimable(row: { group: GhostSeatGroup; state: GhostSeatState }): boolean {
  return row.group === 'G2' && row.state === 'OPEN';
}

/**
 * Why a recommendation closes when its seat ends: `ACCEPTED` when the task that ended it carries the reason of this recommendation
 * (the IT Admin acted on it), `SEAT_ENDED` when something else did (another source, the seat expiring).
 */
export function closeReasonOfEndedSeat(taskReferencesRecommendation: boolean): GhostSeatCloseReason {
  return taskReferencesRecommendation ? 'ACCEPTED' : 'SEAT_ENDED';
}

/** What a recommendation about a seat does when its seat or its revocation task moved. */
export type Settlement = { kind: 'KEEP' } | { kind: 'CLOSE'; reason: GhostSeatCloseReason } | { kind: 'REOPEN' };

export interface SettlementInput {
  group: GhostSeatGroup;
  state: GhostSeatState;
  /** Whether the seat chain still has an assignment that holds a seat today (a K1 seat whose access runs on still does). */
  seatStillOpen: boolean;
  /** The revocation task the recommendation holds, when it holds one: where it stands and whether it carries this recommendation's reason. */
  task: { status: string; referencesRecommendation: boolean } | null;
}

/**
 * What the listener of a revocation and the daily run do with a recommendation about a seat (`US-07-05` AC-12, AC-15; `DA6-02`,
 * `DA6-27`): a seat that no longer holds a seat closes it (`ACCEPTED` when the task that ended it carries its reason, else
 * `SEAT_ENDED`); a `G2` whose reclaim was closed as failed goes back to open; everything else waits (a claim of the task, a K1
 * access that runs on, a recommendation a head paused). The task counts as completed only when its status says so.
 */
export function settlementOf(input: SettlementInput): Settlement {
  if (input.state === 'CLOSED' || input.state === 'PAUSED') return { kind: 'KEEP' };
  if (!input.seatStillOpen) {
    const accepted = input.task?.status === 'COMPLETED' && input.task.referencesRecommendation;

    return { kind: 'CLOSE', reason: closeReasonOfEndedSeat(accepted) };
  }
  const failed = input.task?.status === 'CLOSED_FAILED' || input.task?.status === 'CANCELLED';

  return failed && input.group === 'G2' && input.state === 'RECLAIM_DECIDED' ? { kind: 'REOPEN' } : { kind: 'KEEP' };
}

/**
 * `KPI-5` (`DA6-39`): the share of recommendations that were right, among those the IT Admin was asked to look at. The tier
 * _watch_ is only an observation of the IT Admin (`FR-4.12`), so it is not in the denominator; a `G1` has no tier and counts.
 */
export function countsInKpi5(row: { group: GhostSeatGroup; tier: GhostSeatTier | null }): boolean {
  return row.group === 'G1' || row.group === 'G2' || row.tier === 'REVIEW' || row.tier === 'ACTION';
}

/** The reasons that make a recommendation _right_ for `KPI-5`; a later item adds its own values here. */
export const KPI5_NUMERATOR_REASONS: readonly GhostSeatCloseReason[] = ['KEPT', 'NEGATED', 'SUPERSEDED'];

export interface Kpi5Row {
  group: GhostSeatGroup;
  tier: GhostSeatTier | null;
  state: GhostSeatState;
  closeReason: GhostSeatCloseReason | null;
}

export interface Kpi5Slice {
  denominator: number;
  numerator: number;
  /** In percent with one decimal; null when nothing was recommended (no figure is made up). */
  ratePercent: number | null;
}

const slice = (rows: readonly Kpi5Row[]): Kpi5Slice => {
  const numerator = rows.filter(
    (row) => row.closeReason !== null && KPI5_NUMERATOR_REASONS.includes(row.closeReason),
  ).length;

  return {
    denominator: rows.length,
    numerator,
    ratePercent: rows.length === 0 ? null : Math.round((numerator / rows.length) * 1000) / 10,
  };
};

/** The figure of `KPI-5` over the recommendations made in a period, and for each group (the confidence label of `G1`/`G2` is internal data). */
export function kpi5Of(rows: readonly Kpi5Row[]): Kpi5Slice & { byGroup: Record<string, Kpi5Slice> } {
  const counted = rows.filter(countsInKpi5);
  const groups = [...new Set(counted.map((row) => row.group))].sort();

  return {
    ...slice(counted),
    byGroup: Object.fromEntries(groups.map((group) => [group, slice(counted.filter((row) => row.group === group))])),
  };
}
