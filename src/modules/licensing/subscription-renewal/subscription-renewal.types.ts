import type { BusinessDate } from '../../../core/business-date';
import type { RenewalFinancialSnapshot } from '../public/licensing-subscription-renewal.types';

export type RenewalChoice = 'RENEW' | 'REDUCE' | 'CANCEL';
export type RenewalState = 'PROPOSED' | 'DECIDED' | 'OUTCOME_RECORDED';
export type ExecutionPoint = 'AS_PLANNED' | 'MID_TERM' | 'NEXT_RENEWAL';
export type RenewalOutcomeKind = 'AS_DECIDED' | 'VENDOR_REFUSED' | 'DIFFERENT' | 'UNCONFIRMED';
export type NoticeBasis = 'DECLARED' | 'INFERRED_UNCONFIRMED' | 'BY_END_DATE';
export type DeciderRole = 'SPENDING_APPROVER' | 'CONFLICT_SUBSTITUTE';
export type DeadlineOutcome = 'AUTO_RENEWAL_INCIDENT' | 'EXPIRY_MARKED';
/** The order a seat is offered in when a reduction goes below the seats in use (`QĐ-66x`). */
export type SeatRankGroup = 'REVOCATION_DECIDED' | 'HOLDER_LEFT' | 'USAGE_FLAGGED' | 'OTHER';

export const RENEWAL_CHOICES = ['RENEW', 'REDUCE', 'CANCEL'] as const;
export const RENEWAL_OUTCOMES = ['AS_DECIDED', 'VENDOR_REFUSED', 'DIFFERENT', 'UNCONFIRMED'] as const;

/** The snapshot frozen with a decision: the money the decider saw, or that none was connected. */
export type DecisionSnapshot =
  { source: 'CONNECTED'; financial: RenewalFinancialSnapshot } | { source: 'NOT_CONNECTED'; takenAt: string };

export interface RenewalDecisionRecord {
  choice: RenewalChoice;
  quantity: number | null;
  reason: string | null;
  decidedByEmployeeId: string;
  deciderRole: DeciderRole;
  decidedAt: Date;
  decidedOn: BusinessDate;
  decidedAfterDeadline: boolean;
  executionPoint: ExecutionPoint;
  activeSeatsAtDecision: number;
  snapshot: DecisionSnapshot;
}

export interface RenewalOutcomeRecord {
  kind: RenewalOutcomeKind;
  note: string | null;
  recordedByEmployeeId: string;
  recordedAt: Date;
  vendorFollowUpOpen: boolean;
  nextSubscriptionId: string | null;
  realisedSavings: { amountMinor: bigint; currency: string } | null;
}

/** One renewal case: the proposal of a period, then the decision and the outcome as they come. */
export interface RenewalRecord {
  id: string;
  organizationId: string;
  subscriptionId: string;
  state: RenewalState;
  noticeBasis: NoticeBasis;
  noticeBaseDate: BusinessDate;
  proposedChoice: RenewalChoice;
  proposedQuantity: number | null;
  proposalNote: string | null;
  businessOwnerOpinion: string | null;
  proposedByEmployeeId: string;
  proposedAt: Date;
  decision: RenewalDecisionRecord | null;
  lateFlaggedAt: Date | null;
  outcome: RenewalOutcomeRecord | null;
}

export interface NewRenewal {
  organizationId: string;
  subscriptionId: string;
  noticeBasis: NoticeBasis;
  noticeBaseDate: BusinessDate;
  proposedChoice: RenewalChoice;
  proposedQuantity: number | null;
  proposalNote: string | null;
  businessOwnerOpinion: string | null;
  proposedByEmployeeId: string;
  proposedByAppUserId: string;
}

export interface DecisionWrite extends Omit<RenewalDecisionRecord, 'decidedAt'> {
  decidedByAppUserId: string;
  decidedAt: Date;
}

export interface OutcomeWrite extends RenewalOutcomeRecord {
  recordedByAppUserId: string;
}

/** A seat chosen with a decision to be taken back before the next period (`QĐ-66x`). */
export interface ReleasedSeat {
  assignmentId: string;
  rankGroup: SeatRankGroup;
  position: number;
}

/** A seat held on a subscription on a day, with what the ranking of a reduction reads of it. */
export interface HeldSeat {
  assignmentId: string;
  employeeId: string;
  kind: 'PERSONAL' | 'SERVICE';
  validFrom: BusinessDate;
  validUntil: BusinessDate | null;
  expectedEndDate: BusinessDate | null;
  /** A revocation is under way for the seat, and the sources that asked for it. */
  liveRevocationSources: string[];
  /** A task of the provisioning queue (a grant or a revocation) is still open for the seat. */
  hasOpenTask: boolean;
}

export interface DeadlineEventRecord {
  id: string;
  subscriptionId: string;
  kind: DeadlineOutcome;
  noticeBaseDate: BusinessDate;
  autoRenewAtTime: boolean;
  recordedOn: BusinessDate;
  recordedAt: Date;
}
