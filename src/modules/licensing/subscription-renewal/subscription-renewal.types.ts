import type { BusinessDate } from '../../../core/business-date';
import type { RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import type { RenewalFinancialSnapshot } from '../public/licensing-subscription-renewal.types';

/**
 * A period a department owns. The renewal of the shared pool's subscriptions (no owner department) is rewritten by S20-T3/T4; until then the
 * routes that need an owner department read only these, as they always have.
 */
export type OwnedPeriod = RenewalPeriodFacts & { ownerDepartmentId: string };

export const isOwnedPeriod = (period: RenewalPeriodFacts | undefined): period is OwnedPeriod =>
  period !== undefined && period.ownerDepartmentId !== null;

export type RenewalChoice = 'RENEW' | 'REDUCE' | 'CANCEL' | 'INCREASE';
/** `STALE`: a proposal closed because it was out of date when the head confirmed it; the IT Admin proposes again. */
export type RenewalState = 'PROPOSED' | 'DECIDED' | 'OUTCOME_RECORDED' | 'STALE';
export type ExecutionPoint = 'AS_PLANNED' | 'MID_TERM' | 'NEXT_RENEWAL';
export type RenewalOutcomeKind = 'AS_DECIDED' | 'VENDOR_REFUSED' | 'DIFFERENT' | 'UNCONFIRMED';
export type NoticeBasis = 'DECLARED' | 'INFERRED_UNCONFIRMED' | 'BY_END_DATE' | 'BY_RENEWAL_DATE' | 'BY_PAYMENT_DATE';
/**
 * `SPENDING_APPROVER`, `CONFLICT_SUBSTITUTE` and `OWNER_DEPARTMENT_HEAD` are historical: a decision of before the one-write renewal
 * (`QĐ-103e`). `IT_ADMIN_IN_CHARGE` is the one written now: the IT Admin who records the result decides alone.
 */
export type DeciderRole = 'SPENDING_APPROVER' | 'CONFLICT_SUBSTITUTE' | 'OWNER_DEPARTMENT_HEAD' | 'IT_ADMIN_IN_CHARGE';
export type DeadlineOutcome = 'AUTO_RENEWAL_INCIDENT' | 'EXPIRY_MARKED';
/** The order a seat is offered in when a reduction goes below the seats in use (`QĐ-66x`). */
export type SeatRankGroup = 'REVOCATION_DECIDED' | 'HOLDER_LEFT' | 'USAGE_FLAGGED' | 'OTHER';

export const RENEWAL_CHOICES = ['RENEW', 'REDUCE', 'CANCEL', 'INCREASE'] as const;
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
  /** The seats the system counted for the next period when the result was recorded; null on a case written before. */
  seatsNeeded: number | null;
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
  seatsNeeded: number | null;
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

/** What the database says of the seats of a subscription for the count of the seats its next period needs (`SBF-20` §4.3). */
export interface SeatsNeededFacts {
  /** Seats not being taken back whose last day is after the renewal day (no end counts). */
  heldPastRenewal: number;
  /** The seats not being taken back that are in effect today and end by the renewal day: a request to go on using may wait for each. */
  endingAssignmentIds: string[];
  /** The seats not ended today (a seat that starts later and one being taken back included), as the renewal outcome counts them. */
  activeSeatsToday: number;
  /** The grants of the plan approved and not carried out, held by no subscription; zero when not asked for. */
  approvedAwaitingGrant: number;
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
