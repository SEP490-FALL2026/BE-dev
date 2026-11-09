import type { BusinessDate } from '../../../core/business-date';
import type { GhostSeatEvidence } from './ghost-seat-evidence.json';

export const GHOST_SEAT_GROUPS = ['G1', 'G2', 'G3', 'G4'] as const;
export type GhostSeatGroup = (typeof GHOST_SEAT_GROUPS)[number];

/** How firm a recommendation is (`FR-4.12`): watch, review or act on it. A `G1` has none. */
export const GHOST_SEAT_TIERS = ['MONITOR', 'REVIEW', 'ACTION'] as const;
export type GhostSeatTier = (typeof GHOST_SEAT_TIERS)[number];

export const GHOST_SEAT_STATES = ['OPEN', 'PAUSED', 'RECLAIM_DECIDED', 'CLOSED'] as const;
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
] as const;
export type GhostSeatCloseReason = (typeof GHOST_SEAT_CLOSE_REASONS)[number];

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
}
