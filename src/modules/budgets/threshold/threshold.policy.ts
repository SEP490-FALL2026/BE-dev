/**
 * The thresholds of the use of a budget, constants of the product and not parameters (`QĐ-111af`, R-5): the head of the Cost Center and Finance are told when the use reaches 80 percent
 * of the base of the budget, and again when it reaches 100 percent.
 */
export const ALERT_THRESHOLDS = [80, 100] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

/**
 * The thresholds a change of the use crosses: `before < t * base <= after`, with `base` the effective base the Cost Center holds
 * when the change is made (version base plus approved adjustments), and the use what is spent plus what is still held. When an
 * approved adjustment lowers the base without moving the use, `crossedByBaseDrop` evaluates whether the unchanged use now crosses
 * 80 or 100 percent of the new base. Whole amounts: `t * base` is compared as `t * base <= 100 * used`, with the lower threshold first.
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

/**
 * The thresholds crossed when an approved adjustment reduces a Cost Center's effective base while its use remains unchanged:
 * `used * 100 < t * baseBefore` and `t * baseAfter <= used * 100`. Lower threshold comes first.
 */
export function crossedByBaseDrop(input: { used: bigint; baseBefore: bigint; baseAfter: bigint }): AlertThreshold[] {
  if (input.baseBefore <= 0n || input.baseAfter <= 0n || input.baseAfter >= input.baseBefore) return [];

  return ALERT_THRESHOLDS.filter((threshold) => {
    const t = BigInt(threshold);

    return input.used * 100n < t * input.baseBefore && t * input.baseAfter <= input.used * 100n;
  });
}
