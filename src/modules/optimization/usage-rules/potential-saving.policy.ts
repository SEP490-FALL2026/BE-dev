import { addDays, type BusinessDate } from '../../../core/business-date';
import { k1NextBillingOn, k1PaidThroughOn } from '../../../core/term-limit';
import type { GhostSeatPotentialSaving } from '../ghost-seat/ghost-seat-evidence.json';

export interface SavingFacts {
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** The monthly price of one seat (from `monthly_unit_price_minor`) and its billing cycle; null when the plan has no price. */
  price: {
    monthlyPriceMinor: bigint | null;
    currency: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  } | null;
  /** Seats included in the potential saving estimate (defaults to 1 for a single-seat recommendation). */
  seats?: number;
  /** Commitment term length in months (12 or 1) of the K2 subscription or K1 personal commitment, when known. */
  commitmentTermMonths?: 1 | 12 | null;
  /** Earliest effective reduction date (`earliestReducibleOn`), when known. */
  realisableOn?: BusinessDate | null;
  /** Rolling billing anchor date for K1 rights (`YYYY-MM-DD`). */
  billingAnchorOn?: BusinessDate | null;
  /** Evaluation business date (`YYYY-MM-DD`) used to compute K1 next billing / paid-through dates. */
  today?: BusinessDate;
}

const NEVER_SAVING: GhostSeatPotentialSaving = {
  monthlyAmountMinor: null,
  amountAtPointMinor: null,
  currency: null,
  realisableOn: null,
  realisableAt: 'NEVER',
};

const k2TermOf = (facts: SavingFacts, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'): number =>
  facts.commitmentTermMonths ?? (billingCycle === 'ANNUAL' ? 12 : 1);

function k1SavingSchedule(facts: SavingFacts): {
  term: number;
  realisableOn: BusinessDate | null;
  realisableAt: GhostSeatPotentialSaving['realisableAt'];
} {
  if (facts.commitmentTermMonths === 12) {
    const realisableOn =
      facts.realisableOn ??
      (facts.billingAnchorOn && facts.today
        ? addDays(k1PaidThroughOn(facts.billingAnchorOn, facts.today, 12), 1)
        : null);

    return { term: 12, realisableOn, realisableAt: 'NEXT_BILLING' };
  }
  const realisableOn =
    facts.realisableOn ??
    (facts.billingAnchorOn && facts.today ? k1NextBillingOn(facts.billingAnchorOn, facts.today) : null);

  return { term: 1, realisableOn, realisableAt: realisableOn !== null ? 'NEXT_BILLING' : 'UNKNOWN' };
}

/**
 * What a reclaim could save (`FR-4.15`, `R-J09`, `US-10-04` AC-3,):
 * `amountAtPoint = seats × monthly × T`, with `T = commitmentTermMonths` (`12` or `1`) for `K2` and `K1`;
 * `realisableAt` is `RENEWAL` (K2 12m), `NEXT_BILLING` (K2 1m / K1 with schedule), `UNKNOWN`, or `NEVER` (`K4`).
 */
export function potentialSavingOf(facts: SavingFacts): GhostSeatPotentialSaving | null {
  if (facts.provisioningType === 'K4') return NEVER_SAVING;
  const price = facts.price;
  if (!price || price.billingCycle === 'OTHER' || price.monthlyPriceMinor === null) return null;

  const monthly = price.monthlyPriceMinor;
  const seats = BigInt(facts.seats ?? 1);
  if (facts.provisioningType === 'K1') {
    const schedule = k1SavingSchedule(facts);

    return {
      monthlyAmountMinor: monthly.toString(),
      amountAtPointMinor: (seats * monthly * BigInt(schedule.term)).toString(),
      currency: price.currency,
      realisableOn: schedule.realisableOn,
      realisableAt: schedule.realisableAt,
    };
  }
  const term = facts.provisioningType === 'K2' ? k2TermOf(facts, price.billingCycle) : 1;
  const realisableAt: GhostSeatPotentialSaving['realisableAt'] =
    facts.provisioningType === 'K2' ? (term === 12 ? 'RENEWAL' : 'NEXT_BILLING') : 'UNKNOWN';

  return {
    monthlyAmountMinor: monthly.toString(),
    amountAtPointMinor: (seats * monthly * BigInt(term)).toString(),
    currency: price.currency,
    realisableOn: facts.provisioningType === 'K2' ? (facts.realisableOn ?? null) : null,
    realisableAt,
  };
}
