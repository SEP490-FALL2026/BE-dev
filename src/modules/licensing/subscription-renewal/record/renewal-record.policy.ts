import type { BusinessDate } from '../../../../core/business-date';
import type {
  PeriodAdjustment,
  PeriodNoticeSource,
  RenewalPeriodFacts,
} from '../../../catalog/public/subscription-period.types';
import type { RenewalProblem } from '../subscription-renewal.errors';
import { choiceProblem, type SeatsNeededCounts } from '../seats-needed/renewal-seats-needed.policy';
import type { NoticeBasis, RenewalChoice, RenewalOutcomeKind, RenewalRecord } from '../subscription-renewal.types';

/** Why a result is not recorded: the problem the route answers with and what it says of it. */
export interface RecordRefusal {
  problem: RenewalProblem;
  details?: Record<string, string | number | boolean | null>;
}

/** Why a subscription has no renewal (`details.reason` of `NOT_RENEWABLE`). */
export type NotRenewableReason = 'PERPETUAL' | 'INTERNAL' | 'NOT_POOL_TERM' | 'NOT_ACTIVE' | 'ALREADY_CONTINUED';

/**
 * The reason a subscription has no point of adjustment (`SBF-20` §4.1), the first of the list: a perpetual purchase, internal software, a
 * term that is not a workspace of the shared pool (`K1` has no point, `FR-1.12`(9)), a draft, a period a later one continues. Null when it has.
 */
function notRenewableReason(period: RenewalPeriodFacts): NotRenewableReason | null {
  if (period.kind === 'PERPETUAL') return 'PERPETUAL';
  if (period.applicationKind === 'INTERNAL') return 'INTERNAL';
  if (period.provisioningType !== 'K2') return 'NOT_POOL_TERM';
  if (period.status !== 'ACTIVE') return 'NOT_ACTIVE';

  return period.renewedById === null ? null : 'ALREADY_CONTINUED';
}

/**
 * Whether the quantity fits the choice (`SBF-20` §4.4 step 5): a cancellation names none; a renewal names the seats bought, a reduction fewer
 * and a raise more. Which number it must be is the business of the count of the seats needed.
 */
function quantityFits(choice: RenewalChoice, quantity: number | null, purchasedQuantity: number | null): boolean {
  if (choice === 'CANCEL') return quantity === null;
  if (quantity === null || quantity < 0) return false;
  if (purchasedQuantity === null) return true;
  if (choice === 'RENEW') return quantity === purchasedQuantity;

  return choice === 'REDUCE' ? quantity < purchasedQuantity : quantity > purchasedQuantity;
}

/**
 * What the request is judged by before the seats are counted, in the order the route answers (`SBF-20` §4.4 steps 2, 4 and 5): the subscription
 * has a point (`NOT_RENEWABLE` with its reason, then `CONTRACT_DATA_INCOMPLETE` when no date gives one), the point has come (a result is recorded
 * after the renewal day too: a late renewal, `QĐ-98e`), and the quantity fits the choice. Anybody who is an IT Admin records: who answers for the
 * subscription is no check (`QĐ-58b`, step 3).
 */
export function preflightOf(input: {
  period: RenewalPeriodFacts;
  today: BusinessDate;
  choice: RenewalChoice;
  quantity: number | null;
}): { adjustment: PeriodAdjustment } | { refusal: RecordRefusal } {
  const { period, today } = input;
  const reason = notRenewableReason(period);
  if (reason !== null) return { refusal: { problem: 'NOT_RENEWABLE', details: { reason } } };
  const adjustment = period.adjustment;
  if (adjustment === null) return { refusal: { problem: 'CONTRACT_DATA_INCOMPLETE' } };
  if (today < adjustment.point) {
    return {
      refusal: {
        problem: 'BEFORE_ADJUSTMENT_POINT',
        details: { adjustmentPointOn: adjustment.point, deadline: adjustment.deadline },
      },
    };
  }
  if (!quantityFits(input.choice, input.quantity, period.purchasedQuantity)) {
    return { refusal: { problem: 'QUANTITY_INVALID' } };
  }

  return { adjustment };
}

/**
 * What the counted seats say of the choice (`SBF-20` §4.4 step 6): the problem of the rule of the seats needed with the numbers the IT Admin reads
 * to count again (`QĐ-104d`); null when the choice is the one the count asks for.
 */
export function countsRefusal(
  counts: SeatsNeededCounts,
  input: { choice: RenewalChoice; quantity: number | null; note: string | null },
): RecordRefusal | null {
  const problem = choiceProblem(counts, input);
  if (problem === null) return null;
  if (problem === 'CANCEL_NOT_ALLOWED') {
    return {
      problem,
      details: {
        seatsNeeded: counts.seatsNeeded,
        heldPastRenewal: counts.heldPastRenewal,
        pendingContinuations: counts.pendingContinuations,
        approvedAwaitingGrant: counts.approvedAwaitingGrant,
        activeSeatsToday: counts.activeSeatsToday,
        openRequests: counts.openRequests,
      },
    };
  }
  if (problem === 'QUANTITY_NOT_SEATS_NEEDED') {
    return {
      problem,
      details: {
        seatsNeeded: counts.seatsNeeded,
        vendorMinimumSeats: counts.vendorMinimumSeats,
        target: counts.target,
        quantity: input.quantity,
      },
    };
  }

  return { problem, details: { seatsNeeded: counts.seatsNeeded, vendorMinimumSeats: counts.vendorMinimumSeats } };
}

/**
 * The case that already stands for the period (`SBF-20` §4.4 step 7, R2-1): the live case of the same deadline, or a case left `DECIDED` before
 * the one-write renewal, whose base date followed the old rule and still waits for its outcome (the route of the outcome closes it first). Null
 * when none does. A `STALE` case is not among the cases given.
 */
export function existingCaseOf(cases: readonly RenewalRecord[], deadline: BusinessDate): RenewalRecord | null {
  return (
    cases.find((record) => record.noticeBaseDate === deadline) ??
    cases.find((record) => record.state === 'DECIDED') ??
    null
  );
}

/** Where the day the case counts from comes from (R2-6): the kind of the point, and for a deadline whether the contract declared it. */
export function noticeBasisOf(kind: PeriodAdjustment['kind'], noticeSource: PeriodNoticeSource): NoticeBasis {
  if (kind === 'PAYMENT_DATE') return 'BY_PAYMENT_DATE';
  if (kind === 'RENEWAL_DATE') return 'BY_RENEWAL_DATE';
  if (kind === 'END_DATE') return 'BY_END_DATE';

  return noticeSource === 'DECLARED' ? 'DECLARED' : 'INFERRED_UNCONFIRMED';
}

/**
 * A renewal the vendor made that the company did not choose, known the day the result is recorded (`QĐ-106i`(4), `SBF-20` §4.4 step 10): a
 * reduction or a cancellation of which the vendor kept more seats than chosen, or a period when none was to be. The detection by invoice is another item.
 */
export function unintendedRenewalOf(input: {
  choice: RenewalChoice;
  quantity: number | null;
  outcome: RenewalOutcomeKind;
  nextQuantity: number | null;
}): boolean {
  if (input.outcome !== 'VENDOR_REFUSED' && input.outcome !== 'DIFFERENT') return false;
  if (input.nextQuantity === null) return false;
  if (input.choice === 'CANCEL') return true;

  return input.choice === 'REDUCE' && input.nextQuantity > (input.quantity ?? 0);
}

/**
 * The renewal day of the period a case was recorded against (`QĐ-106i`(2)): a plan by the month renews on its payment day, which is the day the
 * case counts from; a plan by the year renews on its renewal day (else its end day) when that is not before the deadline, else on the deadline.
 * It is read back from the case and the dates of the subscription, so no day is stored twice.
 */
function renewalDayOf(
  record: Pick<RenewalRecord, 'noticeBasis' | 'noticeBaseDate'>,
  period: Pick<RenewalPeriodFacts, 'renewalDate' | 'endDate'>,
): BusinessDate {
  if (record.noticeBasis === 'BY_PAYMENT_DATE') return record.noticeBaseDate;
  const last = period.renewalDate ?? period.endDate;

  return last !== null && last >= record.noticeBaseDate ? last : record.noticeBaseDate;
}

/** Whether the result was recorded after the renewal day of the period: a late renewal, told with the case (`QĐ-98e`, `SBF-20` §4.4 step 4). */
export function lateRenewalOf(
  record: Pick<RenewalRecord, 'noticeBasis' | 'noticeBaseDate'>,
  period: Pick<RenewalPeriodFacts, 'renewalDate' | 'endDate'>,
  recordedOn: BusinessDate,
): boolean {
  return recordedOn > renewalDayOf(record, period);
}
