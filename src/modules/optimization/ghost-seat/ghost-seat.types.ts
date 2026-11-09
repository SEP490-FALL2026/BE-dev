import type { BusinessDate } from '../../../core/business-date';
import type { GhostSeatEvidence } from './ghost-seat-evidence.json';

export const GHOST_SEAT_GROUPS = ['G1', 'G2', 'G3', 'G4'] as const;
export type GhostSeatGroup = (typeof GHOST_SEAT_GROUPS)[number];

/** How firm a recommendation is (`FR-4.12`): watch, review or act on it. A `G1` has none. */
export const GHOST_SEAT_TIERS = ['MONITOR', 'REVIEW', 'ACTION'] as const;
export type GhostSeatTier = (typeof GHOST_SEAT_TIERS)[number];

export const GHOST_SEAT_STATES = [
  'OPEN',
  'PAUSED',
  'RECLAIM_DECIDED',
  'CLOSED',
  'AWAITING_DECISION',
  'WAITING_FOR_HEAD',
  'RETURNED_TO_HEAD',
] as const;
export type GhostSeatState = (typeof GHOST_SEAT_STATES)[number];

export const GHOST_SEAT_CLOSE_REASONS = [
  'ACCEPTED',
  'SUPERSEDED',
  'SEAT_ENDED',
  'FREE_SEATS_GONE',
  'OUT_OF_SCOPE',
  'KEPT',
  'NEGATED',
  'TRANSFER_SEAT_REVOKED',
  'EXEMPTED',
  'LEFT_TO_EXPIRE',
] as const;
export type GhostSeatCloseReason = (typeof GHOST_SEAT_CLOSE_REASONS)[number];

/** How sure the rule is of a `G3`/`G4` (`FR-4.14`): a level and the reasons that lowered it, never a percentage. */
export type GhostSeatConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
/** `NEVER_ACTIVE` is `G3` (the person never appears); `INACTIVE` is `G4` (a day of activity, or only a login, and then none). */
export type GhostSeatActivityStatus = 'NEVER_ACTIVE' | 'INACTIVE';

/** What a `G3`/`G4` adds to a recommendation: null for a `G1`/`G2`. */
export interface GhostSeatUsageColumns {
  confidence: GhostSeatConfidence;
  activityStatus: GhostSeatActivityStatus;
  /** The days covered by a source that tells the negative, with no activity, after the last day of activity (not calendar days: `FR-4.14a`(3)). */
  inactiveDays: number | null;
  lastActiveDate: BusinessDate | null;
  /** The recommendation about the seat a head kept or exempted that this one follows (`US-10-08` AC-2). */
  previousRecommendationId: string | null;
}

/** What `G1` tells the IT Admin to do with the free seats: take them back before buying more, or reduce what is bought. */
export type GhostSeatG1Action = 'REGRANT_OR_REDUCE' | 'REGRANT_BEFORE_PURCHASE';

/** One recommendation as the module keeps it. */
export interface GhostSeatRecord {
  id: string;
  organizationId: string;
  group: GhostSeatGroup;
  state: GhostSeatState;
  closeReason: GhostSeatCloseReason | null;
  tier: GhostSeatTier | null;
  applicationId: string;
  planId: string;
  subscriptionId: string | null;
  assignmentId: string | null;
  seatChainId: string | null;
  employeeId: string | null;
  /** The department that owns the seat of a `G2` when it was recommended; null for a `G1` and for a seat with no owner. */
  departmentId: string | null;
  freeSeats: number | null;
  countsTowardVacantCost: boolean | null;
  revocationTaskId: string | null;
  /** The day the run found that the holder of a seat already decided on had left (`DA6-04`); null otherwise. */
  holderLeftOn: BusinessDate | null;
  evidence: GhostSeatEvidence;
  createdRunId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  closedByAppUserId: string | null;
  supersededById: string | null;
  /** The department whose head decides (`AWAITING_DECISION`, `RETURNED_TO_HEAD`); kept after the decision as the trace of who was asked. */
  deciderDepartmentId: string | null;
  routedAt: Date | null;
  /** The day the head's decision is due: working days from the day the recommendation entered the queue, never reset. */
  decisionDueOn: BusinessDate | null;
  overdueNoticedAt: Date | null;
  /** How many times the IT Admin returned the reclaim to the head: at most one (`OI-02`). */
  returnCount: number;
  /** The first day the revocation of a reclaim the head decided can be taken (the end of the grace). */
  revocationNotBefore: BusinessDate | null;
  pausedAt: Date | null;
  pauseTransferId: string | null;
  /** `G3`/`G4` only (null for the others). */
  usage: GhostSeatUsageColumns | null;
  /** The first day of activity after a reclaim was decided: the table flags it, the IT Admin weighs giving the seat back (`Q-92`). */
  activityAfterDecisionOn: BusinessDate | null;
}

/** What a run writes when it makes a recommendation. */
export interface NewGhostSeat {
  /** Given when a recommendation that replaces another is made after the other names it (`SUPERSEDED`). */
  id?: string;
  organizationId: string;
  group: GhostSeatGroup;
  state: GhostSeatState;
  tier: GhostSeatTier | null;
  applicationId: string;
  planId: string;
  subscriptionId: string | null;
  assignmentId: string | null;
  seatChainId: string | null;
  employeeId: string | null;
  departmentId: string | null;
  freeSeats: number | null;
  countsTowardVacantCost: boolean | null;
  revocationTaskId: string | null;
  evidence: GhostSeatEvidence;
  createdRunId: string;
  /** `G3`/`G4` only. */
  usage?: GhostSeatUsageColumns;
  /** A `G3`/`G4` made for a holder in a transfer that has taken effect is made `PAUSED` at once (`QĐ-90c`). */
  pause?: { at: Date; transferId: string };
}
