import { addDays, type BusinessDate } from '../../../../core/business-date';
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
  details?: Record<string, unknown>;
}

/** Why a subscription has no renewal (`details.reason` of `NOT_RENEWABLE`). */
export type NotRenewableReason =
  'PERPETUAL' | 'INTERNAL' | 'NOT_POOL_TERM' | 'NOT_ACTIVE' | 'ALREADY_CONTINUED' | 'CANCELLED' | 'MEMBER_COUNTED';

/**
 * The reason a subscription has no point of adjustment (`SBF-20` §4.1), the first of the list: a perpetual purchase, internal software, a
 * term that is not a workspace of the shared pool (`K1` has no point, `FR-1.12`(9)), a draft, a period a later one continues, a subscription
 * counted by its members (`MEMBER_COUNTED`), or a subscription the company recorded as cancelled (`ending`). Null when it has.
 */
function notRenewableReason(period: RenewalPeriodFacts, ending: boolean): NotRenewableReason | null {
  if (period.kind === 'PERPETUAL') return 'PERPETUAL';
  if (period.applicationKind === 'INTERNAL') return 'INTERNAL';
  if (period.provisioningType !== 'K2') return 'NOT_POOL_TERM';
  if (period.status !== 'ACTIVE') return 'NOT_ACTIVE';

  if (period.renewedById !== null) return 'ALREADY_CONTINUED';
  if (period.seatCounting === 'MEMBERS') return 'MEMBER_COUNTED';

  return ending ? 'CANCELLED' : null;
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
 * The point of adjustment of a subscription (`SBF-20` §4.1), the first two refusals of a recorded result and the whole of a read before it:
 * the subscription has a point (`NOT_RENEWABLE` with its reason), then a date gives one (`CONTRACT_DATA_INCOMPLETE`). Whether the point has come
 * is not asked here: the IT Admin reads the count before it.
 */
export function pointOf(
  period: RenewalPeriodFacts,
  ending: boolean,
): { adjustment: PeriodAdjustment } | { refusal: RecordRefusal } {
  const reason = notRenewableReason(period, ending);
  if (reason !== null) return { refusal: { problem: 'NOT_RENEWABLE', details: { reason } } };
  const adjustment = period.adjustment;

  return adjustment === null ? { refusal: { problem: 'CONTRACT_DATA_INCOMPLETE' } } : { adjustment };
}

/**
 * What the request is judged by before the seats are counted, in the order the route answers (`SBF-20` §4.4 steps 2, 4 and 5): the subscription
 * has a point (`NOT_RENEWABLE` with its reason, then `CONTRACT_DATA_INCOMPLETE` when no date gives one), the point has come (a result is recorded
 * after the renewal day too: a late renewal, `QĐ-98e`), and the quantity fits the choice.
 */
export function preflightOf(input: {
  period: RenewalPeriodFacts;
  /** The company recorded the subscription as cancelled (`A1C-02`). */
  ending: boolean;
  today: BusinessDate;
  choice: RenewalChoice;
  quantity: number | null;
}): { adjustment: PeriodAdjustment } | { refusal: RecordRefusal } {
  const { period, today } = input;
  const found = pointOf(period, input.ending);
  if ('refusal' in found) return found;
  const { adjustment } = found;
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
 * Whether a result with no new period can be recorded (`A1C-03`, `V-2`): the case is written complete in one write and the period then has its result
 * for good, so a renewal, a reduction or an increase with no new period would leave the period with no way to ever record it (the seats would not
 * carry and Finance would not be told). Only a vendor that refused a plan by the month leaves it out: the next payment day opens another point.
 * A cancellation as decided names no new period; one the vendor refused or did otherwise means the vendor made a period anyway, which is recorded
 * (and told as an incident), whatever the plan. Null when the result can be recorded.
 */
export function nextPeriodProblem(input: {
  choice: RenewalChoice;
  outcome: RenewalOutcomeKind;
  hasNextPeriod: boolean;
  commitment: PeriodAdjustment['commitment'];
}): RecordRefusal | null {
  if (input.hasNextPeriod) return null;
  if (input.choice === 'CANCEL') return input.outcome === 'AS_DECIDED' ? null : { problem: 'NEXT_PERIOD_REQUIRED' };
  if (input.outcome === 'VENDOR_REFUSED' && input.commitment === 'MONTHLY') return null;

  return { problem: 'NEXT_PERIOD_REQUIRED' };
}

/**
 * Whether the new period starts on the day of the renewal (`A1C-04`, `QĐ-103v`: a plan by the year is cut only at its renewal). A plan by the
 * year renews on `end`, which the vendor words as the renewal day or as the day after the last day of the old period, so both are taken; a plan
 * by the month starts on its payment day, `end`. Any other day would cut the old period in the middle or leave a gap, and the seats counted for
 * the renewal day would not be the seats carried to the new period. Null when it starts on the day.
 */
export function nextStartProblem(adjustment: PeriodAdjustment, startDate: BusinessDate): RecordRefusal | null {
  const days = adjustment.commitment === 'MONTHLY' ? [adjustment.end] : [adjustment.end, addDays(adjustment.end, 1)];
  if (days.includes(startDate)) return null;

  return { problem: 'PERIOD_REFUSED', details: { reason: 'NOT_ON_RENEWAL_DAY', renewalOn: adjustment.end } };
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

/**
 * The case of a cancellation decided before the one-write renewal that still waits for its outcome (`V-3`, `SBF-20` §4.4 step 7, R2-1). The company
 * still ends that subscription (`ending`), but the IT Admin must close the case first, on the route of the outcome, so a write or a read of the
 * adjustment answers it as `ALREADY_PROPOSED` with the case, before it answers `NOT_RENEWABLE` / `CANCELLED`, which is for a cancellation already
 * recorded as decided. Null when there is none.
 */
export function decidedCancelOf(cases: readonly RenewalRecord[]): RenewalRecord | null {
  return cases.find((record) => record.state === 'DECIDED' && record.decision?.choice === 'CANCEL') ?? null;
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
 * cancellation of which the vendor made a period anyway, or any other choice of which the period bought more seats than the one chosen (a count
 * the system made is the most the company may pay for, `QĐ-104d`, `A1C-05`). The detection by invoice is another item.
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

  return input.nextQuantity > (input.quantity ?? 0);
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
