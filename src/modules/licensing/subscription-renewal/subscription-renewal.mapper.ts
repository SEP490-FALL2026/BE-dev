import type { PeriodAdjustment, RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import { cancelProblem, suggestedChoiceOf, type SeatsNeededCounts } from './seats-needed/renewal-seats-needed.policy';
import type {
  DeadlineEventWire,
  RenewalAdjustmentWire,
  RenewalDetailWire,
  RenewalSummaryWire,
} from './subscription-renewal.dto';
import type { DeadlineEventRecord, ReleasedSeat, RenewalRecord } from './subscription-renewal.types';

/** The subscription of a case. */
export type ItAdminWire = { employeeId: string; employeeCode: string; fullName: string };

const briefOf = (period: RenewalPeriodFacts, admins: ReadonlyMap<string, ItAdminWire>) => ({
  id: period.subscriptionId,
  planId: period.planId,
  planName: period.planName,
  applicationId: period.applicationId,
  applicationName: period.applicationName,
  provisioningType: period.provisioningType,
  responsibleItAdmin: (period.responsibleItAdminEmployeeId && admins.get(period.responsibleItAdminEmployeeId)) || null,
});

/** A case as a list shows it: the period it is about, the milestone, the choice proposed and where the case stands. */
export function toRenewalSummary(
  record: RenewalRecord,
  period: RenewalPeriodFacts,
  admins: ReadonlyMap<string, ItAdminWire>,
): RenewalSummaryWire {
  return {
    id: record.id,
    state: record.state,
    subscription: briefOf(period, admins),
    milestone: { basis: record.noticeBasis, baseDate: record.noticeBaseDate },
    proposedChoice: record.proposedChoice,
    proposedQuantity: record.proposedQuantity,
    decidedChoice: record.decision?.choice ?? null,
    executionPoint: record.decision?.executionPoint ?? null,
    outcome: record.outcome?.kind ?? null,
    lateFlagged: record.lateFlaggedAt !== null,
    // No case waits for a head any more (QĐ-103e): the field stays null for the readers that still have it.
    waitingReason: null,
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
    admins: ReadonlyMap<string, ItAdminWire>;
    seatsInUse: number;
    usageAvailable: boolean;
    released: readonly ReleasedSeat[];
    savings: { amount: string; currency: string } | null;
    /** Whether the outcome was recorded after the renewal day of the period (a late renewal, `QĐ-98e`). */
    lateRenewal: boolean;
    /** False for the IT Admin: the money the head saw is not theirs to read (`L-617`). */
    showSnapshot: boolean;
  },
): RenewalDetailWire {
  const { period, released } = context;
  const { decision, outcome } = record;

  return {
    ...toRenewalSummary(record, period, context.admins),
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
      seatsNeeded: record.seatsNeeded,
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
      lateRenewal: context.lateRenewal,
    },
  };
}

export function toDeadlineEvent(
  event: DeadlineEventRecord,
  period: RenewalPeriodFacts,
  admins: ReadonlyMap<string, ItAdminWire>,
): DeadlineEventWire {
  return {
    id: event.id,
    subscription: briefOf(period, admins),
    kind: event.kind,
    milestoneDate: event.noticeBaseDate,
    autoRenewAtTime: event.autoRenewAtTime,
    recordedOn: event.recordedOn,
    recordedAt: event.recordedAt.toISOString(),
  };
}

/**
 * The seats a subscription needs as the route reads them before a result is recorded: the point, the count in its three parts, the target and
 * whether a cancellation is allowed (the same rule the write applies). `callerIsResponsible` is true only for the IT Admin responsible; it is
 * false for a reader who is not, and when nobody is responsible.
 */
export function toAdjustmentWire(
  period: Pick<RenewalPeriodFacts, 'subscriptionId' | 'purchasedQuantity' | 'vendorMinimumSeats'>,
  adjustment: PeriodAdjustment,
  counts: SeatsNeededCounts,
  who: { responsibleItAdminEmployeeId: string | null; callerEmployeeId: string; recordedRenewalId: string | null },
): RenewalAdjustmentWire {
  return {
    subscriptionId: period.subscriptionId,
    commitment: adjustment.commitment,
    deadlineKind: adjustment.kind,
    deadline: adjustment.deadline,
    adjustmentPointOn: adjustment.point,
    renewalOn: adjustment.end,
    redAlertOn: adjustment.redAlertOn,
    purchasedQuantity: period.purchasedQuantity,
    vendorMinimumSeats: period.vendorMinimumSeats,
    seatsNeeded: {
      total: counts.seatsNeeded,
      heldPastRenewal: counts.heldPastRenewal,
      pendingContinuations: counts.pendingContinuations,
      approvedAwaitingGrant: counts.approvedAwaitingGrant,
    },
    target: counts.target,
    suggestedChoice: suggestedChoiceOf(counts.target, period.purchasedQuantity),
    canCancel: cancelProblem(counts) === null,
    activeSeatsToday: counts.activeSeatsToday,
    openRequests: counts.openRequests,
    responsibleItAdminEmployeeId: who.responsibleItAdminEmployeeId,
    callerIsResponsible: who.responsibleItAdminEmployeeId === who.callerEmployeeId,
    recordedRenewalId: who.recordedRenewalId,
  };
}
