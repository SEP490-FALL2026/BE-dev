import { addDays, type BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { SeatCommitment } from '../../budgets/public/budgets.types';
import type { ProvisioningKind, RevocationCompletedFacts } from '../../licensing/public/licensing.types';
import { releaseOnLateGrant, releaseOnRevocation } from '../../licensing/public/seat-month-cost.policy';

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
  /** The year its amount was worked out for, and how many months of that year the amount covers (null for a one-time price). */
  budgetYear: number | null;
  amountMonths: number | null;
}

const monthOf = (day: BusinessDate): number => Number(day.slice(5, 7));

const smaller = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** The last month of `year` the request covers: the month of its end in that year, none when it ended before the year, else December. */
export function lastMonthOf(year: number, endDate: BusinessDate | null): number {
  if (endDate === null) return 12;
  const endYear = fiscalYearOf(endDate);
  if (endYear < year) return 0;

  return endYear === year ? monthOf(endDate) : 12;
}

/**
 * The first month of its year a commitment covers: January for the one made on 01/01; for the one of an approval, the months of its amount
 * counted back from its last month (the month the amount began to count, `BR-MF1-06`).
 */
export function firstMonthOf(commitment: Pick<SeatCommitment, 'year' | 'origin'>, coverage: SeatCoverage): number {
  if (commitment.origin === 'YEAR_START') return 1;
  if (coverage.budgetYear !== commitment.year || coverage.amountMonths === null || coverage.amountMonths <= 0) return 1;

  return Math.max(1, lastMonthOf(commitment.year, coverage.endDate) - coverage.amountMonths + 1);
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

/**
 * What one seat of the commitment gives back when the right ends on `endsOn` (`RV-07`): the months from the month of `endsOn` to the last
 * month the request covers, less what the days of that month before `endsOn` cost. A right that ended in an earlier year gives nothing back;
 * a commitment of a year after the end, or one whose months begin after the end, gives back every month it covers.
 */
export function revocationShare(input: {
  commitment: SeatCommitment;
  coverage: SeatCoverage;
  endsOn: BusinessDate;
  currentYear: number;
}): bigint {
  const { commitment, coverage, endsOn } = input;
  if (!releasable(commitment, input.currentYear)) return 0n;
  const endYear = fiscalYearOf(endsOn);
  if (commitment.year < endYear) return 0n;
  const first = firstMonthOf(commitment, coverage);
  const last = lastMonthOf(commitment.year, coverage.endDate);
  if (last < first) return 0n;
  const amount =
    commitment.year > endYear || monthOf(endsOn) < first
      ? commitment.seatMonthlyMinor * BigInt(last - first + 1)
      : releaseOnRevocation({ monthlyMinor: commitment.seatMonthlyMinor, endsOn, lastMonth: last });

  return amount > 0n ? smaller(amount, commitment.heldMinor) : 0n;
}

/**
 * What one seat of the commitment gives back when its K2 right is granted on `grantedOn`, after the commitment began (`M-10`): the months
 * from its first month to the month before the grant, and the days of the month of the grant before it. Only the commitment of the year of
 * the grant; a grant on day 1 of the first month gives nothing back.
 */
export function lateGrantShare(input: {
  commitment: SeatCommitment;
  coverage: SeatCoverage;
  grantedOn: BusinessDate;
  currentYear: number;
}): bigint {
  const { commitment, coverage, grantedOn } = input;
  if (!releasable(commitment, input.currentYear)) return 0n;
  if (fiscalYearOf(grantedOn) !== commitment.year) return 0n;
  const first = firstMonthOf(commitment, coverage);
  if (monthOf(grantedOn) < first) return 0n;
  const amount = releaseOnLateGrant({ monthlyMinor: commitment.seatMonthlyMinor, grantedOn, firstMonth: first });

  return amount > 0n ? smaller(amount, commitment.heldMinor) : 0n;
}

/** Whether the grant of this kind gives back the days before it: only a K2 right, whose seat is bought for the year (`M-10`). */
export const releasesBeforeGrant = (kind: ProvisioningKind): boolean => kind === 'K2';
