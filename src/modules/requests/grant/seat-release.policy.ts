import { addDays, type BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { lastMonthBeginsOn } from '../../../core/term-limit';
import type { MonthReleaseInput, SeatCommitment } from '../../budgets/public/budgets.types';
import type { ProvisioningKind, RevocationCompletedFacts } from '../../licensing/public/licensing.types';
import { monthCostBefore, releaseOnLateGrant, releaseOnRevocation } from '../../../core/seat-month-cost';

/**
 * How much of the money a request holds for a seat goes back by the day (`RV-07`, `M-06`, `M-10`), as pure decisions. In the month the right
 * ends, the days before the day it ends are used: the price a month times those days over the days of the month, rounded half up to the
 * smallest unit of the currency; the rest of that month and the months after it in the year go back. A right granted after its commitment
 * began gives back the months before the month of the grant and the days of that month before it. Only a K1 or K2 right, whose price is by
 * the month; never a one-time price (K4). Only a commitment of a year that is still open (the year of today or later); a closed year is left
 * as it is. Never more than the commitment still holds.
 */

/** The kinds of right whose commitment is a price a month, and so goes back by the day. */
const BY_THE_MONTH: readonly ProvisioningKind[] = ['K1', 'K2'];

/** What a request says of the months its commitment covers. */
export interface SeatCoverage {
  /** The last day the request pays for the right (its end, or the new end of a request to go on using); null when it has no end. */
  endDate: BusinessDate | null;
  /**
   * The day the last month of its months of use begins on (R-39: a month that has begun counts whole, so a term from 15/03 to 14/06 is March, April
   * and May); null when its months are counted by the calendar, as the months of an end a person chose by hand are.
   */
  lastMonthBeginsOn: BusinessDate | null;
  /** The year its amount was worked out for, and how many months of that year the amount covers (null for a one-time price). */
  budgetYear: number | null;
  amountMonths: number | null;
}

/**
 * The last day a request pays for the right (`SeatCoverage.endDate`). A request records its own end when it is an older one or one to go on
 * using. A request with months of use records none (the end is worked out when the seat is granted, `RQ-2`), so its end is that of the seat its
 * grant made; a right with no months of use (long-term, a one-time price) has none, whatever seat it made.
 */
export function coverageEndOf(input: {
  recordedEnd: BusinessDate | null;
  termMonths: number | null;
  grantedEnd: BusinessDate | null;
}): BusinessDate | null {
  if (input.recordedEnd !== null) return input.recordedEnd;

  return input.termMonths !== null && input.termMonths > 0 ? input.grantedEnd : null;
}

/**
 * The day the last month of a request begins on (`SeatCoverage.lastMonthBeginsOn`): for a request with months of use whose end is the one of a term
 * run, the last day a month of the seat began on, from its start to that end (a term from 15/03 ends 14/06 and its last month began on 15/05, a term
 * cut by a contract on 16/05 had one begin on 15/05). None when its months are counted by the calendar: an end a person chose by hand (a request of
 * an older release), no months of use, no end, or no start known.
 */
export function lastMonthBeginsOf(input: {
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  termMonths: number | null;
  byHand: boolean;
}): BusinessDate | null {
  const { startDate, endDate } = input;
  if (input.byHand || input.termMonths === null || input.termMonths <= 0) return null;
  if (startDate === null || endDate === null || endDate < startDate) return null;

  return lastMonthBeginsOn({ start: startDate, end: endDate });
}

const monthOf = (day: BusinessDate): number => Number(day.slice(5, 7));

/** The day that says the last month a request covers: the one its last month begins on, else the last day it pays for. */
const lastDayOf = (coverage: SeatCoverage): BusinessDate | null => coverage.lastMonthBeginsOn ?? coverage.endDate;

const smaller = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/**
 * The last month of `year` the request covers, from the day that says it (`lastDayOf`): the month of that day in that year, none when it is before
 * the year, else December; December too when there is no such day.
 */
export function lastMonthOf(year: number, lastDay: BusinessDate | null): number {
  if (lastDay === null) return 12;
  const lastYear = fiscalYearOf(lastDay);
  if (lastYear < year) return 0;

  return lastYear === year ? monthOf(lastDay) : 12;
}

/**
 * The first month of its year a commitment covers: January for the one made on 01/01; for the one of an approval, the months of its amount
 * counted back from its last month (the month the amount began to count, `BR-MF1-06`).
 */
export function firstMonthOf(commitment: Pick<SeatCommitment, 'year' | 'origin'>, coverage: SeatCoverage): number {
  if (commitment.origin === 'YEAR_START') return 1;
  if (coverage.budgetYear !== commitment.year || coverage.amountMonths === null || coverage.amountMonths <= 0) return 1;

  return Math.max(1, lastMonthOf(commitment.year, lastDayOf(coverage)) - coverage.amountMonths + 1);
}

/**
 * The first day the right taken back no longer costs anything: for K2 the day it ends (it holds the seat on every day before it); for K1 the
 * day after the last day paid for, since what was paid is not given back. Null for any other kind, whose commitment does not go back by day.
 */
export function revocationEndsOn(
  facts: Pick<RevocationCompletedFacts, 'provisioningType' | 'endedOn' | 'paidThroughOn'>,
): BusinessDate | null {
  if (!BY_THE_MONTH.includes(facts.provisioningType)) return null;
  if (facts.provisioningType === 'K1' && facts.paidThroughOn !== null) return addDays(facts.paidThroughOn, 1);

  return facts.endedOn;
}

/** Whether a commitment can go back by the day at all: a year still open, a price a month kept on it, something still held. */
function releasable(
  commitment: SeatCommitment,
  currentYear: number,
): commitment is SeatCommitment & { seatMonthlyMinor: bigint } {
  return (
    commitment.year >= currentYear &&
    commitment.seatMonthlyMinor !== null &&
    commitment.seatMonthlyMinor > 0n &&
    commitment.heldMinor > 0n
  );
}

export interface SeatReleaseBreakdown {
  readonly amountMinor: bigint;
  readonly months: readonly MonthReleaseInput[];
}

const ZERO_BREAKDOWN: SeatReleaseBreakdown = { amountMinor: 0n, months: [] };

function monthlyRevocationBreakdown(
  commitment: SeatCommitment & { seatMonthlyMinor: bigint },
  endsOn: BusinessDate,
): SeatReleaseBreakdown {
  const sliceMonths = [...(commitment.months ?? [])].sort();
  if (sliceMonths.length === 0) return ZERO_BREAKDOWN;
  const first = monthOf(sliceMonths[0]);
  const endYear = fiscalYearOf(endsOn);
  const endMonth = monthOf(endsOn);
  const allFromStart = commitment.year > endYear || endMonth < first;
  const months: MonthReleaseInput[] = [];

  for (const month of sliceMonths) {
    const m = monthOf(month);
    if (allFromStart || m > endMonth) {
      months.push({ month, amountMinor: commitment.seatMonthlyMinor });
    } else if (m === endMonth) {
      const part = commitment.seatMonthlyMinor - monthCostBefore(commitment.seatMonthlyMinor, endsOn);
      if (part > 0n) months.push({ month, amountMinor: part });
    }
  }
  const sum = months.reduce((acc, item) => acc + item.amountMinor, 0n);
  return sum > 0n ? { amountMinor: smaller(sum, commitment.heldMinor), months } : ZERO_BREAKDOWN;
}

function monthlyLateGrantBreakdown(
  commitment: SeatCommitment & { seatMonthlyMinor: bigint },
  grantedOn: BusinessDate,
): SeatReleaseBreakdown {
  const sliceMonths = [...(commitment.months ?? [])].sort();
  if (sliceMonths.length === 0) return ZERO_BREAKDOWN;
  const first = monthOf(sliceMonths[0]);
  const grantMonth = monthOf(grantedOn);
  if (grantMonth < first) return ZERO_BREAKDOWN;
  const months: MonthReleaseInput[] = [];

  for (const month of sliceMonths) {
    const m = monthOf(month);
    if (m < grantMonth) {
      months.push({ month, amountMinor: commitment.seatMonthlyMinor });
    } else if (m === grantMonth) {
      const part = monthCostBefore(commitment.seatMonthlyMinor, grantedOn);
      if (part > 0n) months.push({ month, amountMinor: part });
    }
  }
  const sum = months.reduce((acc, item) => acc + item.amountMinor, 0n);
  return sum > 0n ? { amountMinor: smaller(sum, commitment.heldMinor), months } : ZERO_BREAKDOWN;
}

/**
 * Per-month and capped total release for a revocation or transfer (`RV-07`, `W3-07` F2).
 * When `commitment.months` is present (monthly-sliced K2), month bounds come from min/max slice months instead of `SeatCoverage`.
 */
export function revocationBreakdown(input: {
  commitment: SeatCommitment;
  coverage: SeatCoverage;
  endsOn: BusinessDate;
  currentYear: number;
}): SeatReleaseBreakdown {
  const { commitment, coverage, endsOn } = input;
  if (!releasable(commitment, input.currentYear)) return ZERO_BREAKDOWN;
  // The request pays to its end date included: a right that ended after it was used to the last day (an expiry taken back on time).
  if (coverage.endDate !== null && endsOn > coverage.endDate) return ZERO_BREAKDOWN;
  const endYear = fiscalYearOf(endsOn);
  if (commitment.year < endYear) return ZERO_BREAKDOWN;
  if ((commitment.months?.length ?? 0) > 0) {
    return monthlyRevocationBreakdown(commitment, endsOn);
  }
  const first = firstMonthOf(commitment, coverage);
  const last = lastMonthOf(commitment.year, lastDayOf(coverage));
  if (last < first) return ZERO_BREAKDOWN;
  const amount =
    commitment.year > endYear || monthOf(endsOn) < first
      ? commitment.seatMonthlyMinor * BigInt(last - first + 1)
      : releaseOnRevocation({ monthlyMinor: commitment.seatMonthlyMinor, endsOn, lastMonth: last });

  return amount > 0n ? { amountMinor: smaller(amount, commitment.heldMinor), months: [] } : ZERO_BREAKDOWN;
}

/**
 * What one seat of the commitment gives back when the right ends on `endsOn` (`RV-07`).
 */
export function revocationShare(input: {
  commitment: SeatCommitment;
  coverage: SeatCoverage;
  endsOn: BusinessDate;
  currentYear: number;
}): bigint {
  return revocationBreakdown(input).amountMinor;
}

/**
 * Per-month and capped total release for a late K2 grant (`M-10`, `W3-07` F1/F2).
 */
export function lateGrantBreakdown(input: {
  commitment: SeatCommitment;
  coverage: SeatCoverage;
  grantedOn: BusinessDate;
  currentYear: number;
}): SeatReleaseBreakdown {
  const { commitment, coverage, grantedOn } = input;
  if (!releasable(commitment, input.currentYear)) return ZERO_BREAKDOWN;
  if (fiscalYearOf(grantedOn) !== commitment.year) return ZERO_BREAKDOWN;
  if ((commitment.months?.length ?? 0) > 0) {
    return monthlyLateGrantBreakdown(commitment, grantedOn);
  }
  const first = firstMonthOf(commitment, coverage);
  if (monthOf(grantedOn) < first) return ZERO_BREAKDOWN;
  const amount = releaseOnLateGrant({ monthlyMinor: commitment.seatMonthlyMinor, grantedOn, firstMonth: first });

  return amount > 0n ? { amountMinor: smaller(amount, commitment.heldMinor), months: [] } : ZERO_BREAKDOWN;
}

/**
 * What one seat of the commitment gives back when its K2 right is granted on `grantedOn`, after the commitment began (`M-10`).
 */
export function lateGrantShare(input: {
  commitment: SeatCommitment;
  coverage: SeatCoverage;
  grantedOn: BusinessDate;
  currentYear: number;
}): bigint {
  return lateGrantBreakdown(input).amountMinor;
}

/** Whether the grant of this kind gives back the days before it: only a K2 right, whose seat is bought for the year (`M-10`). */
export const releasesBeforeGrant = (kind: ProvisioningKind): boolean => kind === 'K2';

/**
 * The first day the old department no longer pays for a right of a person who moved (`QĐ-111bg`): the day the transfer takes effect, for a K1
 * or K2 right alike (the old department stops paying the day the person leaves it; what was spent stays spent). Null for any other kind,
 * whose commitment does not go back by day. The share is the one of {@link revocationShare}, so one rule gives back money by the day.
 */
export function transferReleaseEndsOn(kind: ProvisioningKind, effectiveOn: BusinessDate): BusinessDate | null {
  return BY_THE_MONTH.includes(kind) ? effectiveOn : null;
}

/** The reference of the release a commitment gives for a right the day the transfer takes effect: one for each transfer and right. */
export const transferReleaseReference = (transferId: string, assignmentId: string): string =>
  `transfer:${transferId}:assignment:${assignmentId}`;

/** The right a release of a transfer was for, read from its reference; null for any other reference. */
function assignmentOfTransferReference(reference: string): string | null {
  const match = /^transfer:[^:]+:assignment:(.+)$/.exec(reference);

  return match === null ? null : match[1];
}

/**
 * Whether this commitment gave its money back for the right the day a transfer took effect (BLK-3, D-86): its own ledger has a release of the
 * transfer for one of the assignments of the right (the one taken away and the ones it continues). Such a commitment gives nothing back when the
 * right is taken away, whoever asks for it (the grace ending, a departure, a ghost seat, an expiry), because the days after the transfer went
 * back already. A commitment with no such release goes back at the revocation as ever: a transfer from before the release has none, and the
 * commitment of a year that began in the grace was held after it. So each commitment goes back once for the transfer, never twice and never not at all.
 */
export function givenAtTransfer(
  commitment: Pick<SeatCommitment, 'transferReleases'>,
  chainAssignmentIds: readonly string[],
): boolean {
  return commitment.transferReleases.some((reference) => {
    const assignmentId = assignmentOfTransferReference(reference);

    return assignmentId !== null && chainAssignmentIds.includes(assignmentId);
  });
}
