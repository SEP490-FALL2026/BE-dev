/**
 * The thresholds of the use of a budget, constants of the product and not parameters (`QĐ-111af`, R-5): the head of the Cost Center and Finance are told when the use reaches 80 percent
 * of the base of the budget, and again when it reaches 100 percent.
 */
export const ALERT_THRESHOLDS = [80, 100] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

/**
 * The thresholds a change of the use crosses (`RV-2`, R-28): `before < t × base ≤ after`, with `base` the EFFECTIVE base the Cost Center holds when the change is made (the base of the version
 * with the adjustments approved), and the use what is spent plus what is still held. Only the use going up crosses; a base that is raised or lowered with the use where it was crosses nothing, so an
 * adjustment alone is never told, and the use that goes over the new base is told again (it is another base, so another alert). Whole amounts: `t × base` is compared as `t × base ≤ 100 × after`, no rounding.
 * The lower threshold comes first.
 */
export function crossedThresholds(input: {
  usedBeforeMinor: bigint;
  usedAfterMinor: bigint;
  baseMinor: bigint;
}): AlertThreshold[] {
  if (input.baseMinor <= 0n) return [];

  return ALERT_THRESHOLDS.filter((threshold) => {
    const limit = BigInt(threshold) * input.baseMinor;

    return input.usedBeforeMinor * 100n < limit && limit <= input.usedAfterMinor * 100n;
  });
}
