import type { GhostSeatPotentialSaving } from '../ghost-seat/ghost-seat-evidence.json';

export interface SavingFacts {
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** The price of one seat at the cycle it is billed; null when the plan has no price. */
  price: { amountMinor: bigint; currency: string; billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' } | null;
}

const MONTHS: Record<'MONTHLY' | 'QUARTERLY' | 'ANNUAL', bigint> = { MONTHLY: 1n, QUARTERLY: 3n, ANNUAL: 12n };

/**
 * What a reclaim could save (`FR-4.15`, `R-J09`, `US-10-04` AC-3): the month, and the amount at the point it can be had. `K2` on an annual plan
 * is the month converted, and the year (`monthly x 12`) at the renewal or point of adjustment; `K2` on a monthly plan one month at the point;
 * `K1` one month at the next billing; `K4` nothing, ever. Until the points of adjustment exist (`W5`) the day of the point is not known.
 * Only the month adds up across seats; the amount at the point is never added to what was avoided or really saved.
 */
export function potentialSavingOf(facts: SavingFacts): GhostSeatPotentialSaving | null {
  if (facts.provisioningType === 'K4') {
    return {
      monthlyAmountMinor: null,
      amountAtPointMinor: null,
      currency: null,
      realisableOn: null,
      realisableAt: 'NEVER',
    };
  }
  const price = facts.price;
  if (!price || price.billingCycle === 'OTHER') return null;
  const months = MONTHS[price.billingCycle];
  const monthly = price.amountMinor / months;
  const annualK2 = facts.provisioningType === 'K2' && price.billingCycle === 'ANNUAL';

  return {
    monthlyAmountMinor: monthly.toString(),
    amountAtPointMinor: (annualK2 ? monthly * 12n : monthly).toString(),
    currency: price.currency,
    realisableOn: null,
    realisableAt: 'UNKNOWN',
  };
}
