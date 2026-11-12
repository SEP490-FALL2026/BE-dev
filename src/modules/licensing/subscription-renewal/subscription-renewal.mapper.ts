import type { RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import type { DeadlineEventWire, RenewalDetailWire, RenewalSummaryWire } from './subscription-renewal.dto';
import type { DeadlineEventRecord, ReleasedSeat, RenewalRecord } from './subscription-renewal.types';

const briefOf = (period: RenewalPeriodFacts) => ({
  id: period.subscriptionId,
  planId: period.planId,
  planName: period.planName,
  applicationId: period.applicationId,
  applicationName: period.applicationName,
  ownerDepartmentId: period.ownerDepartmentId,
});

/** A case as a list shows it: the period it is about, the milestone, the choice proposed and where the case stands. */
export function toRenewalSummary(
  record: RenewalRecord,
  period: RenewalPeriodFacts,
  waitingReason: RenewalSummaryWire['waitingReason'],
): RenewalSummaryWire {
  return {
    id: record.id,
    state: record.state,
    subscription: briefOf(period),
    milestone: { basis: record.noticeBasis, baseDate: record.noticeBaseDate },
    proposedChoice: record.proposedChoice,
    proposedQuantity: record.proposedQuantity,
    decidedChoice: record.decision?.choice ?? null,
    executionPoint: record.decision?.executionPoint ?? null,
    outcome: record.outcome?.kind ?? null,
    lateFlagged: record.lateFlaggedAt !== null,
    waitingReason,
    proposedAt: record.proposedAt.toISOString(),
  };
}

/** The decision as its page shows it; the IT Admin does not read the money the head saw (`L-617`). */
function decisionWire(
  decision: NonNullable<RenewalRecord['decision']>,
  releasedSeatCount: number,
  showSnapshot: boolean,
): NonNullable<RenewalDetailWire['decision']> {
  return {
    choice: decision.choice,
    quantity: decision.quantity,
    reason: decision.reason,
    decidedByEmployeeId: decision.decidedByEmployeeId,
    deciderRole: decision.deciderRole,
    decidedAt: decision.decidedAt.toISOString(),
    decidedOn: decision.decidedOn,
    decidedAfterDeadline: decision.decidedAfterDeadline,
    executionPoint: decision.executionPoint,
    seatsInUseAtDecision: decision.activeSeatsAtDecision,
    releasedSeatCount,
    snapshot: showSnapshot ? decision.snapshot : null,
  };
}

/** A case as its page shows it, with the period, the seats in use, the decision and its snapshot, and the outcome. */
export function toRenewalDetail(
  record: RenewalRecord,
  context: {
    period: RenewalPeriodFacts;
    seatsInUse: number;
    usageAvailable: boolean;
    released: readonly ReleasedSeat[];
    savings: { amount: string; currency: string } | null;
    waitingReason: RenewalSummaryWire['waitingReason'];
    /** False for the IT Admin: the money the head saw is not theirs to read (`L-617`). */
    showSnapshot: boolean;
  },
): RenewalDetailWire {
  const { period, released } = context;
  const { decision, outcome } = record;

  return {
    ...toRenewalSummary(record, period, context.waitingReason),
    period: {
      purchasedQuantity: period.purchasedQuantity,
      billingCycle: period.billingCycle,
      startDate: period.startDate,
      endDate: period.endDate,
      renewalDate: period.renewalDate,
      autoRenew: period.autoRenew,
      allowsMidTermReduction: period.allowsMidTermReduction,
      seatsInUse: context.seatsInUse,
    },
    usage: { status: context.usageAvailable ? 'AVAILABLE' : 'NOT_AVAILABLE' },
    proposal: {
      choice: record.proposedChoice,
      quantity: record.proposedQuantity,
      note: record.proposalNote,
      proposedByEmployeeId: record.proposedByEmployeeId,
      proposedAt: record.proposedAt.toISOString(),
      releasedSeatCount: released.length,
    },
    decision: decision && decisionWire(decision, released.length, context.showSnapshot),
    lateFlaggedAt: record.lateFlaggedAt?.toISOString() ?? null,
    outcomeDetail: outcome && {
      kind: outcome.kind,
      note: outcome.note,
      recordedByEmployeeId: outcome.recordedByEmployeeId,
      recordedAt: outcome.recordedAt.toISOString(),
      vendorFollowUpOpen: outcome.vendorFollowUpOpen,
      nextSubscriptionId: outcome.nextSubscriptionId,
      realisedSavings: context.savings,
    },
  };
}

export function toDeadlineEvent(event: DeadlineEventRecord, period: RenewalPeriodFacts): DeadlineEventWire {
  return {
    id: event.id,
    subscription: briefOf(period),
    kind: event.kind,
    milestoneDate: event.noticeBaseDate,
    autoRenewAtTime: event.autoRenewAtTime,
    recordedOn: event.recordedOn,
    recordedAt: event.recordedAt.toISOString(),
  };
}
