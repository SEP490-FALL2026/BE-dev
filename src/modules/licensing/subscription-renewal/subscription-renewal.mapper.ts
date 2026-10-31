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
export function toRenewalSummary(record: RenewalRecord, period: RenewalPeriodFacts): RenewalSummaryWire {
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
    proposedAt: record.proposedAt.toISOString(),
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
  },
): RenewalDetailWire {
  const { period, released } = context;
  const { decision, outcome } = record;

  return {
    ...toRenewalSummary(record, period),
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
      businessOwnerOpinion: record.businessOwnerOpinion,
      proposedByEmployeeId: record.proposedByEmployeeId,
      proposedAt: record.proposedAt.toISOString(),
    },
    decision: decision && {
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
      releasedSeatCount: released.length,
      snapshot: decision.snapshot,
    },
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
