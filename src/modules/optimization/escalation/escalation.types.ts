import type { GhostSeatGroup, GhostSeatState, GhostSeatTier } from '../ghost-seat/ghost-seat.types';

/** Why a recommendation of a batch was not pushed: the wire names each one, the batch is never refused for one of them. */
export const ESCALATION_SKIP_REASONS = [
  'NOT_FOUND',
  'NOT_WATCH',
  'SEAT_ENDED',
  'MACHINE_ACCOUNT',
  'TRANSFER_GRACE',
  'NO_DEPARTMENT',
] as const;
export type EscalationSkipReason = (typeof ESCALATION_SKIP_REASONS)[number];

/** Where a recommendation that was pushed went: the queue of the head of the holder's department, or waiting for one. */
export type EscalationQueueState = Extract<GhostSeatState, 'AWAITING_DECISION' | 'WAITING_FOR_HEAD'>;

/** What the batch says of one recommendation, in the order the caller named them. */
export type EscalationItemResult =
  | { recommendationId: string; outcome: 'ESCALATED'; state: EscalationQueueState; departmentId: string }
  | { recommendationId: string; outcome: 'SKIPPED'; reason: EscalationSkipReason };

/** What a recommendation shows of itself to the rule: nothing else of it is judged. */
export interface EscalationCandidate {
  group: GhostSeatGroup;
  tier: GhostSeatTier | null;
  state: GhostSeatState;
  employeeId: string | null;
  seatChainId: string | null;
}

/** What the rule reads: the recommendation (null when none has the id), the seat it is about today, the transfer of the holder and where they are placed. */
export interface EscalationFacts {
  record: EscalationCandidate | null;
  /** The seat of the chain today; null when the chain no longer holds a seat. */
  seat: { isMachineAccount: boolean } | null;
  /** The holder is in a transfer that has taken effect and is not closed (the grace of `QĐ-110p`). */
  inTransfer: boolean;
  /** The department the holder is placed in today; null when none. */
  placementDepartmentId: string | null;
}

export type EscalationVerdict = { kind: 'ESCALATE' } | { kind: 'SKIP'; reason: EscalationSkipReason };

/** The answer of the route: the batch that was recorded, each recommendation's result, and whether this key was answered before. */
export interface EscalationOutcome {
  id: string;
  results: EscalationItemResult[];
  replayed: boolean;
}
