import type { BusinessDate } from '../../../core/business-date';
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
  /** Commitment term length in months (12 or 1) of the K2 subscription, when known. */
  commitmentTermMonths?: 1 | 12 | null;
  /** Earliest effective reduction date (`earliestReducibleOn`), when known. */
  realisableOn?: BusinessDate | null;
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

const realisableAtOf = (
  provisioningType: SavingFacts['provisioningType'],
  term: number,
): GhostSeatPotentialSaving['realisableAt'] =>
  provisioningType === 'K2' ? (term === 12 ? 'RENEWAL' : 'NEXT_BILLING') : 'UNKNOWN';

/**
 * What a reclaim could save (`FR-4.15`, `R-J09`, `US-10-04` AC-3, `W3-09`):
 * `amountAtPoint = seats × monthly × T`, with `T = commitmentTermMonths` (`12` or `1`) for `K2` (so a 12-month commitment
 * billed monthly still multiplies by `12`), `1` for `K1`; `realisableAt` is `RENEWAL` (12m), `NEXT_BILLING` (1m),
 * `UNKNOWN` (`K1` in B1), or `NEVER` (`K4`).
 */
export function potentialSavingOf(facts: SavingFacts): GhostSeatPotentialSaving | null {
  if (facts.provisioningType === 'K4') return NEVER_SAVING;
  const price = facts.price;
  if (!price || price.billingCycle === 'OTHER' || price.monthlyPriceMinor === null) return null;

  const monthly = price.monthlyPriceMinor;
  const seats = BigInt(facts.seats ?? 1);
  const term = facts.provisioningType === 'K2' ? k2TermOf(facts, price.billingCycle) : 1;

  return {
    monthlyAmountMinor: monthly.toString(),
    amountAtPointMinor: (seats * monthly * BigInt(term)).toString(),
    currency: price.currency,
    realisableOn: facts.provisioningType === 'K2' ? (facts.realisableOn ?? null) : null,
    realisableAt: realisableAtOf(facts.provisioningType, term),
  };
}
