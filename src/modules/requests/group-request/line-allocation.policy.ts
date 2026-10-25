import type { PaymentPeriod } from '../access-request/pricing.policy';

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
 * The payments of a request made for `priced` people, as they are for `scoped` of them: every payment is the unit price times
 * the people, so it divides exactly, and a schedule that does not divide is a schedule that was not made for those people.
 * Returns null then.
 */
export function scaleSchedule(
  schedule: readonly PaymentPeriod[],
  priced: number,
  scoped: number,
): PaymentPeriod[] | null {
  if (priced < 1 || scoped < 1 || scoped > priced) return null;
  const scaled: PaymentPeriod[] = [];
  for (const period of schedule) {
    const product = period.amountMinor * BigInt(scoped);
    if (product % BigInt(priced) !== 0n) return null;
    scaled.push({ ...period, amountMinor: product / BigInt(priced) });
  }

  return scaled;
}

/** The shares that go back when a person is withdrawn: all they hold that was not yet given back. */
export function shareToRelease<T extends { releasedAt: Date | null; budgetYear: number; amountMinor: bigint }>(
  shares: readonly T[],
): YearShare[] {
  return shares
    .filter((share) => share.releasedAt === null)
    .map((share) => ({ year: share.budgetYear, amountMinor: share.amountMinor }));
}
