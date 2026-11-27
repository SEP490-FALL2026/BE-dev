import type { BusinessDate } from '../../../core/business-date';
import type { Money } from '../../../core/money/money';
import type { BillingCycleCode } from '../access-request/access-request.types';
import { requestAmountOf } from '../access-request/pricing.policy';

/**
 * How the money of a request for a group is divided among its people (`US-05-17` AC-9, AC-10), as pure calculations in whole
 * minor units: a commitment is one for each year, the share of a person is a part of it, and what is given back when one
 * person goes is exactly that part.
 */

/**
 * Divides one year's cost among the people in the order they are named: each person gets the whole part of the division and the
 * remainder goes one minor unit at a time to the first people, so the shares add up to the cost exactly and differ by at most one.
 */
export function allocateEvenly(totalMinor: bigint, people: number): bigint[] {
  if (people < 1) throw new Error('A cost is divided among at least one person.');
  if (totalMinor < 0n) throw new Error('A cost is never negative.');
  const count = BigInt(people);
  const base = totalMinor / count;
  const remainder = Number(totalMinor % count);

  return Array.from({ length: people }, (_, index) => base + (index < remainder ? 1n : 0n));
}

/** What one person of a group costs in the year of the check and in the year after (`QĐ-111j`, `QĐ-111k`). */
export interface LineAmounts {
  current: bigint;
  next: bigint;
}

/**
 * What each of the people costs, each for their own end (R-38): a person cut at the end of a contract costs fewer months than one who is not.
 * People who end the same day cost the same, so one calculation of that day is divided among them (the remainder to the first), as the price
 * of the request is added up: the parts of all of them are exactly what the request costs. In the order of `ends`; null when the price
 * cannot be counted by the month.
 */
export function lineAmountsOf(input: {
  provisioningType?: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  unitPrice: Money;
  monthlyPriceMinor?: bigint | null;
  billingCycle: BillingCycleCode;
  checkDate: BusinessDate;
  ends: readonly (BusinessDate | null)[];
}): LineAmounts[] | null {
  const byEnd = new Map<BusinessDate | null, number[]>();
  input.ends.forEach((end, index) => byEnd.set(end, [...(byEnd.get(end) ?? []), index]));
  const amounts: LineAmounts[] = input.ends.map(() => ({ current: 0n, next: 0n }));
  for (const [endDate, indexes] of byEnd) {
    const priced = requestAmountOf({
      kind: 'RECURRING',
      provisioningType: input.provisioningType,
      unitPrice: input.unitPrice,
      monthlyPriceMinor: input.monthlyPriceMinor,
      billingCycle: input.billingCycle,
      beneficiaries: indexes.length,
      checkDate: input.checkDate,
      endDate,
    });
    if (priced.status !== 'PRICED') return null;
    const current = allocateEvenly(priced.amount.amountMinor, indexes.length);
    const next = allocateEvenly(priced.nextYearAmount?.amountMinor ?? 0n, indexes.length);
    indexes.forEach((index, position) => {
      amounts[index] = { current: current[position], next: next[position] };
    });
  }

  return amounts;
}

export interface YearShare {
  year: number;
  amountMinor: bigint;
}

/** One person's shares over the years, none of nothing: a person whose part of a year rounds to zero has no share of it. */
export function sharesOf(costs: readonly YearShare[], people: number, index: number): YearShare[] {
  return costs
    .map((cost) => ({ year: cost.year, amountMinor: allocateEvenly(cost.amountMinor, people)[index] }))
    .filter((share) => share.amountMinor > 0n);
}

/**
 * The amount of a request made for `priced` people, as it is for `scoped` of them (`QĐ-109`): the same share of it, rounded up to a whole
 * minor unit (TẠM CHỌN: a price that does not divide is paid in full, as in `R-B01`). Null for no people or for more than it was made for.
 */
export function scaleAmount(amountMinor: bigint, priced: number, scoped: number): bigint | null {
  if (priced < 1 || scoped < 1 || scoped > priced) return null;
  const divisor = BigInt(priced);

  return (amountMinor * BigInt(scoped) + divisor - 1n) / divisor;
}

/**
 * The shares that go back when a person is withdrawn: all they hold in a commitment that was not yet given back. The part of the year after
 * that is only kept for 01/01 is not held by any commitment, so there is nothing of it to give back (`QĐ-111k`).
 */
export function shareToRelease<
  T extends { releasedAt: Date | null; budgetYear: number; amountMinor: bigint; held: boolean },
>(shares: readonly T[]): YearShare[] {
  return shares
    .filter((share) => share.releasedAt === null && share.held)
    .map((share) => ({ year: share.budgetYear, amountMinor: share.amountMinor }));
}

/**
 * What the request costs once `approved` of the `priced` people are left, in the currency of the price; null when everybody is approved,
 * when there is no amount, or when no people are left.
 */
export function scaledPricing(
  pricing: { amount: { amountMinor: bigint; currency: string } | null },
  priced: number,
  approved: number,
): { amount: { amountMinor: bigint; currency: string } } | null {
  if (pricing.amount === null || approved === priced) return null;
  const scaled = scaleAmount(pricing.amount.amountMinor, priced, approved);
  if (scaled === null) return null;

  return { amount: { amountMinor: scaled, currency: pricing.amount.currency } };
}
