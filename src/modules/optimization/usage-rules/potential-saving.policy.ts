import type { GhostSeatPotentialSaving } from '../ghost-seat/ghost-seat-evidence.json';

export interface SavingFacts {
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** The monthly price of one seat (from `monthly_unit_price_minor`) and its billing cycle; null when the plan has no price. */
  price: {
    monthlyPriceMinor: bigint | null;
    currency: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  } | null;
}

/**
 * What a reclaim could save (`FR-4.15`, `R-J09`, `US-10-04` AC-3): the month, and the amount at the point it can be had. `K2` on an annual plan
 * is `monthlyPriceMinor` for the month, and `monthly × 12` at the renewal or point of adjustment; `K2` on a monthly plan one month at the point;
 * `K1` one month at the next billing; `K4` nothing, ever.
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
  if (!price || price.billingCycle === 'OTHER' || price.monthlyPriceMinor === null) return null;
  const monthly = price.monthlyPriceMinor;
  const annualK2 = facts.provisioningType === 'K2' && price.billingCycle === 'ANNUAL';

  return {
    monthlyAmountMinor: monthly.toString(),
    amountAtPointMinor: (annualK2 ? monthly * 12n : monthly).toString(),
    currency: price.currency,
    realisableOn: null,
    realisableAt: 'UNKNOWN',
  };
}
