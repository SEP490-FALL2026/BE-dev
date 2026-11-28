import type { BusinessDate } from '../../../../core/business-date';

export interface RealisedSavingPeriod {
  commitmentTermMonths: 1 | 12 | null;
  purchasedQuantity: number | null;
  monthlyPriceMinor: bigint | null;
  currency?: string | null;
}

function resolveCurrency(prior: RealisedSavingPeriod, next: RealisedSavingPeriod): string | null {
  const priorCurrency = prior.currency ?? null;
  const nextCurrency = next.currency ?? null;
  if (priorCurrency !== null && nextCurrency !== null && priorCurrency !== nextCurrency) return null;

  return nextCurrency ?? priorCurrency ?? 'VND';
}

function hasRequiredFacts(period: RealisedSavingPeriod): period is RealisedSavingPeriod & {
  purchasedQuantity: number;
  monthlyPriceMinor: bigint;
} {
  return period.purchasedQuantity !== null && period.monthlyPriceMinor !== null;
}

/**
 * Computes the realised saving of a renewal (`Q-G`) when the first invoice of the new period confirms:
 * `T = prior.commitmentTermMonths`, `baseline = q_old × monthly_old × T`, `compared = q_new × monthly_new × T`,
 * `saving = max(0, baseline - compared)`. Clamps negative differences to `0n` (`max(0)`).
 * Returns `null` when terms, quantities, or monthly prices are missing or currencies differ.
 */
export function computeRealisedSaving(
  prior: RealisedSavingPeriod,
  next: RealisedSavingPeriod,
): { amountMinor: bigint; currency: string } | null {
  const term = prior.commitmentTermMonths;
  if (term === null || !hasRequiredFacts(prior) || !hasRequiredFacts(next)) return null;
  const currency = resolveCurrency(prior, next);
  if (currency === null) return null;

  const t = BigInt(term);
  const baseline = BigInt(prior.purchasedQuantity) * prior.monthlyPriceMinor * t;
  const compared = BigInt(next.purchasedQuantity) * next.monthlyPriceMinor * t;
  const diff = baseline - compared;

  return { amountMinor: diff > 0n ? diff : 0n, currency };
}

/** Computes realised savings across old->new line pairs (: `q_old = seats(L, closedOn)`, `q_new = seats(L', startDate)`). */
export function computePerLineRealisedSaving(
  term: 1 | 12 | null,
  pairs: readonly { priorQty: number; priorMonthlyMinor: bigint; nextQty: number; nextMonthlyMinor: bigint }[],
  currency = 'VND',
): { amountMinor: bigint; currency: string } | null {
  if (term === null || pairs.length === 0) return null;
  const t = BigInt(term);
  let baseline = 0n;
  let compared = 0n;
  for (const pair of pairs) {
    baseline += BigInt(pair.priorQty) * pair.priorMonthlyMinor * t;
    compared += BigInt(pair.nextQty) * pair.nextMonthlyMinor * t;
  }
  const diff = baseline - compared;

  return { amountMinor: diff > 0n ? diff : 0n, currency };
}

/**
 * Whether `invoiceServiceMonth` (`YYYY-MM-01`) falls in the start month of `newPeriodStartDate`.
 */
export function isFirstInvoiceMonthOfPeriod(
  periodStartDate: BusinessDate | null,
  invoiceServiceMonth: BusinessDate,
): boolean {
  return periodStartDate !== null && periodStartDate.slice(0, 7) === invoiceServiceMonth.slice(0, 7);
}
